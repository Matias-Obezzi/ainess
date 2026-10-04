//! Signing in to a remote MCP server (a connector) with OAuth, the way the MCP spec lays it out.
//!
//! 1. Discovery: the server's protected-resource metadata (RFC 9728) names its authorization server,
//!    whose own metadata (RFC 8414) has the endpoints.
//! 2. Dynamic client registration (RFC 7591): ainess registers itself as a public client.
//! 3. Authorization code with PKCE (S256): the browser opens the server's login page and comes back
//!    to a listener on 127.0.0.1, on a port picked for this one sign-in.
//! 4. The code is exchanged for tokens, which go to the OS keychain and nowhere else: not to
//!    config.json, not to a log line. The frontend only ever gets an access token right before it
//!    hands it to a run, refreshed here when it is about to expire.

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const KEYCHAIN_SERVICE: &str = "ainess-mcp-oauth";
/// Windows keeps at most 2560 bytes per credential; a JWT and its refresh token can be more.
const CHUNK: usize = 2000;
/// How long the browser has to come back.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);
/// A token this close to expiring is refreshed before it is handed out.
const REFRESH_MARGIN_SECS: u64 = 60;

/// What is kept in the keychain for one connector.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Stored {
    pub client_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
    pub token_endpoint: String,
    pub resource: String,
    pub access_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    /// Seconds since the epoch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
}

/// What the frontend may know about a connector's sign-in: whether there is one, and until when.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub connected: bool,
    pub expires_at: Option<u64>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct AuthServer {
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    #[serde(default)]
    pub registration_endpoint: Option<String>,
    #[serde(default)]
    pub scopes_supported: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct ResourceMetadata {
    #[serde(default)]
    authorization_servers: Vec<String>,
}

#[derive(Deserialize)]
struct Registration {
    client_id: String,
    #[serde(default)]
    client_secret: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

// ---- Pure pieces ------------------------------------------------------------------------------

/// Percent-encoding of everything but the unreserved characters (RFC 3986).
pub fn pct(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn unpct(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => { out.push(b' '); i += 1; }
            b'%' if i + 2 < bytes.len() => {
                match u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16) {
                    Ok(v) => { out.push(v); i += 3; }
                    Err(_) => { out.push(b'%'); i += 1; }
                }
            }
            c => { out.push(c); i += 1; }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// `a=b&c=d`, each part encoded.
pub fn form(pairs: &[(&str, &str)]) -> String {
    pairs.iter().map(|(k, v)| format!("{}={}", pct(k), pct(v))).collect::<Vec<_>>().join("&")
}

fn random_token(bytes: usize) -> Result<String, String> {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).map_err(|e| format!("no randomness from the OS: {e}"))?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(buf))
}

/// A PKCE verifier and its S256 challenge.
pub fn pkce_pair() -> Result<(String, String), String> {
    let verifier = random_token(48)?;
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    Ok((verifier, challenge))
}

/// `scheme://host[:port]` of a URL, and the path after it (without a trailing slash).
fn split_url(url: &str) -> Option<(String, String)> {
    let scheme_end = url.find("://")? + 3;
    let rest = &url[scheme_end..];
    let path_start = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let origin = url[..scheme_end + path_start].to_string();
    let path = rest[path_start..].split(['?', '#']).next().unwrap_or("").trim_end_matches('/').to_string();
    Some((origin, path))
}

/// Where a resource's metadata may be (RFC 9728 §3): with its path after the well-known part, then
/// at the root.
pub fn resource_metadata_urls(resource: &str) -> Vec<String> {
    let Some((origin, path)) = split_url(resource) else { return vec![] };
    let mut urls = vec![];
    if !path.is_empty() {
        urls.push(format!("{origin}/.well-known/oauth-protected-resource{path}"));
    }
    urls.push(format!("{origin}/.well-known/oauth-protected-resource"));
    urls
}

/// Where an authorization server's metadata may be (RFC 8414, and OpenID's spelling as a fallback).
pub fn auth_server_metadata_urls(issuer: &str) -> Vec<String> {
    let Some((origin, path)) = split_url(issuer) else { return vec![] };
    vec![
        format!("{origin}/.well-known/oauth-authorization-server{path}"),
        format!("{origin}/.well-known/openid-configuration{path}"),
        format!("{}/.well-known/openid-configuration", issuer.trim_end_matches('/')),
    ]
}

/// The `resource_metadata` a 401's `WWW-Authenticate: Bearer` header points at, if it does.
pub fn resource_metadata_from_challenge(header: &str) -> Option<String> {
    let at = header.find("resource_metadata=")? + "resource_metadata=".len();
    let rest = &header[at..];
    let value = if let Some(stripped) = rest.strip_prefix('"') {
        stripped.split('"').next()?
    } else {
        rest.split([',', ' ']).next()?
    };
    Some(value.to_string())
}

pub struct AuthorizeParams<'a> {
    pub endpoint: &'a str,
    pub client_id: &'a str,
    pub redirect_uri: &'a str,
    pub challenge: &'a str,
    pub state: &'a str,
    pub resource: &'a str,
    pub scope: Option<&'a str>,
}

/// The URL the browser opens to sign in.
pub fn authorize_url(p: &AuthorizeParams) -> String {
    let mut pairs = vec![
        ("response_type", "code"),
        ("client_id", p.client_id),
        ("redirect_uri", p.redirect_uri),
        ("code_challenge", p.challenge),
        ("code_challenge_method", "S256"),
        ("state", p.state),
        ("resource", p.resource),
    ];
    if let Some(scope) = p.scope {
        pairs.push(("scope", scope));
    }
    let sep = if p.endpoint.contains('?') { '&' } else { '?' };
    format!("{}{}{}", p.endpoint, sep, form(&pairs))
}

/// The code and state out of the request line the browser sends back (`GET /callback?code=…`), or
/// the error the server sent instead.
pub fn parse_callback(request_line: &str) -> Result<(String, String), String> {
    let target = request_line.split_whitespace().nth(1).ok_or("not an HTTP request")?;
    let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");
    let mut code = None;
    let mut state = None;
    let mut error = None;
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        match k {
            "code" => code = Some(unpct(v)),
            "state" => state = Some(unpct(v)),
            "error" => error = Some(unpct(v)),
            _ => {}
        }
    }
    if let Some(e) = error {
        return Err(format!("the server refused the sign-in: {e}"));
    }
    Ok((code.ok_or("no code in the callback")?, state.ok_or("no state in the callback")?))
}

/// Whether a stored token should be refreshed before use.
pub fn needs_refresh(stored: &Stored, at: u64) -> bool {
    matches!(stored.expires_at, Some(exp) if at + REFRESH_MARGIN_SECS >= exp)
}

/// One stored value cut into keychain-sized pieces.
pub fn chunks(text: &str) -> Vec<String> {
    let bytes = text.as_bytes();
    if bytes.is_empty() {
        return vec![String::new()];
    }
    // Cut on character boundaries so each piece is valid UTF-8 on its own.
    let mut out = vec![];
    let mut start = 0;
    while start < bytes.len() {
        let mut end = (start + CHUNK).min(bytes.len());
        while !text.is_char_boundary(end) { end -= 1; }
        out.push(text[start..end].to_string());
        start = end;
    }
    out
}

// ---- Keychain ---------------------------------------------------------------------------------

fn entry(user: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, user).map_err(|e| format!("keychain unavailable: {e}"))
}

fn save(id: &str, stored: &Stored) -> Result<(), String> {
    let text = serde_json::to_string(stored).map_err(|e| e.to_string())?;
    let parts = chunks(&text);
    remove(id);
    for (i, part) in parts.iter().enumerate() {
        entry(&format!("{id}#{i}"))?.set_secret(part.as_bytes()).map_err(|e| format!("could not save to the keychain: {e}"))?;
    }
    entry(id)?.set_secret(parts.len().to_string().as_bytes()).map_err(|e| format!("could not save to the keychain: {e}"))
}

fn load(id: &str) -> Option<Stored> {
    let count: usize = String::from_utf8(entry(id).ok()?.get_secret().ok()?).ok()?.parse().ok()?;
    let mut text = String::new();
    for i in 0..count {
        text.push_str(&String::from_utf8(entry(&format!("{id}#{i}")).ok()?.get_secret().ok()?).ok()?);
    }
    serde_json::from_str(&text).ok()
}

fn remove(id: &str) {
    let count: usize = entry(id).ok()
        .and_then(|e| e.get_secret().ok())
        .and_then(|b| String::from_utf8(b).ok())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    for i in 0..count.max(1) {
        if let Ok(e) = entry(&format!("{id}#{i}")) { let _ = e.delete_credential(); }
    }
    if let Ok(e) = entry(id) { let _ = e.delete_credential(); }
}

// ---- Network ----------------------------------------------------------------------------------

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().timeout(Duration::from_secs(20)).build().map_err(|e| e.to_string())
}

async fn get_json<T: serde::de::DeserializeOwned>(client: &reqwest::Client, url: &str) -> Option<T> {
    let res = client.get(url).header("Accept", "application/json").send().await.ok()?;
    if !res.status().is_success() { return None; }
    res.json::<T>().await.ok()
}

/// The authorization server behind a resource, by the routes the spec gives, in its order.
pub async fn discover(client: &reqwest::Client, resource: &str) -> Result<AuthServer, String> {
    let mut issuers: Vec<String> = vec![];
    for url in resource_metadata_urls(resource) {
        if let Some(meta) = get_json::<ResourceMetadata>(client, &url).await {
            issuers = meta.authorization_servers;
            break;
        }
    }
    if issuers.is_empty() {
        // An unauthenticated request is answered with a 401 that says where the metadata is.
        if let Ok(res) = client.get(resource).send().await {
            if let Some(url) = res.headers().get("www-authenticate").and_then(|h| h.to_str().ok()).and_then(resource_metadata_from_challenge) {
                if let Some(meta) = get_json::<ResourceMetadata>(client, &url).await {
                    issuers = meta.authorization_servers;
                }
            }
        }
    }
    if issuers.is_empty() {
        // Older servers are their own authorization server.
        if let Some((origin, _)) = split_url(resource) { issuers.push(origin); }
    }
    for issuer in &issuers {
        for url in auth_server_metadata_urls(issuer) {
            if let Some(server) = get_json::<AuthServer>(client, &url).await {
                return Ok(server);
            }
        }
    }
    Err("this server does not say how to sign in to it (no OAuth metadata found)".into())
}

async fn register(client: &reqwest::Client, endpoint: &str, redirect_uri: &str) -> Result<Registration, String> {
    let body = serde_json::json!({
        "client_name": "ainess",
        "redirect_uris": [redirect_uri],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    });
    let res = client.post(endpoint).json(&body).send().await.map_err(|e| format!("registration failed: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("registration was refused ({})", res.status().as_u16()));
    }
    res.json::<Registration>().await.map_err(|e| format!("registration answered something unreadable: {e}"))
}

async fn token_request(client: &reqwest::Client, endpoint: &str, pairs: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let res = client
        .post(endpoint)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Accept", "application/json")
        .body(form(pairs))
        .send()
        .await
        .map_err(|e| format!("the token request failed: {e}"))?;
    // The body of a refusal can echo what was sent; only the status is worth passing on.
    if !res.status().is_success() {
        return Err(format!("the server refused the token request ({})", res.status().as_u16()));
    }
    res.json::<TokenResponse>().await.map_err(|e| format!("the token answer is unreadable: {e}"))
}

fn stored_from(token: TokenResponse, base: &Stored) -> Stored {
    Stored {
        access_token: token.access_token,
        refresh_token: token.refresh_token.or_else(|| base.refresh_token.clone()),
        expires_at: token.expires_in.map(|s| now() + s),
        ..base.clone()
    }
}

/// Waits on `listener` for the browser to come back with `state`, answers it with `page`, and gives
/// the code. Requests that are not the callback (a favicon) are answered and ignored.
async fn wait_for_code(listener: tokio::net::TcpListener, state: &str, page: &str) -> Result<String, String> {
    let wait = async {
        loop {
            let (mut socket, _) = listener.accept().await.map_err(|e| e.to_string())?;
            let mut buf = vec![0u8; 8192];
            let n = socket.read(&mut buf).await.map_err(|e| e.to_string())?;
            let request = String::from_utf8_lossy(&buf[..n]).to_string();
            let line = request.lines().next().unwrap_or("").to_string();
            if !line.contains("/callback") {
                let _ = socket.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
                continue;
            }
            let body = format!("<!doctype html><meta charset=utf-8><title>ainess</title><body style=\"font-family:system-ui;padding:3rem\"><p>{}</p></body>", html_escape(page));
            let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
            let _ = socket.write_all(response.as_bytes()).await;
            let (code, got_state) = parse_callback(&line)?;
            if got_state != state {
                return Err("the sign-in came back for another request (state mismatch)".to_string());
            }
            return Ok(code);
        }
    };
    tokio::time::timeout(LOGIN_TIMEOUT, wait).await.map_err(|_| "the sign-in was not finished in time".to_string())?
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// The whole sign-in, with how the browser is opened left to the caller (the app opens the user's
/// browser; a test follows the redirect itself).
pub async fn sign_in(resource: &str, page: &str, open: impl FnOnce(String) -> Result<(), String>) -> Result<Stored, String> {
    let client = client()?;
    let server = discover(&client, resource).await?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let registration_endpoint = server.registration_endpoint.clone()
        .ok_or("this server does not let new apps register, and ainess has no client of its own for it")?;
    let registration = register(&client, &registration_endpoint, &redirect_uri).await?;
    let (verifier, challenge) = pkce_pair()?;
    let state = random_token(24)?;
    let scope = server.scopes_supported.as_ref().filter(|s| !s.is_empty()).map(|s| s.join(" "));
    open(authorize_url(&AuthorizeParams {
        endpoint: &server.authorization_endpoint,
        client_id: &registration.client_id,
        redirect_uri: &redirect_uri,
        challenge: &challenge,
        state: &state,
        resource,
        scope: scope.as_deref(),
    }))?;
    let code = wait_for_code(listener, &state, page).await?;
    let mut pairs = vec![
        ("grant_type", "authorization_code"),
        ("code", code.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("client_id", registration.client_id.as_str()),
        ("code_verifier", verifier.as_str()),
        ("resource", resource),
    ];
    if let Some(secret) = &registration.client_secret { pairs.push(("client_secret", secret)); }
    let token = token_request(&client, &server.token_endpoint, &pairs).await?;
    let base = Stored {
        client_id: registration.client_id,
        client_secret: registration.client_secret,
        token_endpoint: server.token_endpoint,
        resource: resource.to_string(),
        access_token: String::new(),
        refresh_token: None,
        expires_at: None,
    };
    Ok(stored_from(token, &base))
}

/// A stored sign-in with an access token good for at least a minute, refreshing it when it was not.
pub async fn fresh(stored: Stored) -> Result<(Stored, bool), String> {
    if !needs_refresh(&stored, now()) { return Ok((stored, false)); }
    let refresh = stored.refresh_token.clone().ok_or("the sign-in expired; connect again")?;
    let client = client()?;
    let mut pairs = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh.as_str()),
        ("client_id", stored.client_id.as_str()),
        ("resource", stored.resource.as_str()),
    ];
    if let Some(secret) = &stored.client_secret { pairs.push(("client_secret", secret)); }
    let token = token_request(&client, &stored.token_endpoint, &pairs).await?;
    Ok((stored_from(token, &stored), true))
}

// ---- Commands ---------------------------------------------------------------------------------

fn host_of(url: &str) -> String {
    split_url(url).map(|(o, _)| o).unwrap_or_default()
}

/// Signs in to the connector `id` at `url`. `page` is what the browser shows once it is done, in the
/// user's language.
#[tauri::command]
pub async fn oauth_connect(app: tauri::AppHandle, id: String, url: String, page: String) -> Result<Status, String> {
    crate::logging::append(&app, "info", "oauth", &format!("signing in to {}", host_of(&url)));
    let result = sign_in(&url, &page, |authorize| {
        tauri_plugin_opener::open_url(authorize, None::<&str>).map_err(|e| format!("could not open the browser: {e}"))
    }).await;
    match result {
        Ok(stored) => {
            let id2 = id.clone();
            let saved = stored.clone();
            tauri::async_runtime::spawn_blocking(move || save(&id2, &saved)).await.map_err(|e| e.to_string())??;
            crate::logging::append(&app, "info", "oauth", &format!("signed in to {}", host_of(&url)));
            Ok(Status { connected: true, expires_at: stored.expires_at })
        }
        Err(e) => {
            crate::logging::append(&app, "warn", "oauth", &format!("sign-in to {} failed: {e}", host_of(&url)));
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn oauth_status(id: String) -> Result<Status, String> {
    let stored = tauri::async_runtime::spawn_blocking(move || load(&id)).await.map_err(|e| e.to_string())?;
    Ok(match stored {
        Some(s) => Status { connected: true, expires_at: s.expires_at },
        None => Status { connected: false, expires_at: None },
    })
}

/// An access token for `id`, refreshed first if it was about to expire. Null when there is no
/// sign-in. Handed to a run and nothing else.
#[tauri::command]
pub async fn oauth_access_token(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    let key = id.clone();
    let Some(stored) = tauri::async_runtime::spawn_blocking(move || load(&key)).await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let (stored, refreshed) = fresh(stored).await.inspect_err(|e| {
        crate::logging::append(&app, "warn", "oauth", &format!("could not refresh connector {id}: {e}"));
    })?;
    if refreshed {
        let key = id.clone();
        let saved = stored.clone();
        tauri::async_runtime::spawn_blocking(move || save(&key, &saved)).await.map_err(|e| e.to_string())??;
    }
    Ok(Some(stored.access_token))
}

#[tauri::command]
pub async fn oauth_disconnect(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || remove(&id)).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_is_the_s256_of_the_verifier() {
        let (verifier, challenge) = pkce_pair().unwrap();
        assert!(verifier.len() >= 43 && verifier.len() <= 128);
        let expected = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        assert_eq!(challenge, expected);
        assert_ne!(pkce_pair().unwrap().0, verifier, "a fresh verifier every time");
    }

    #[test]
    fn metadata_urls_follow_the_specs() {
        assert_eq!(resource_metadata_urls("https://mcp.example.com/v1/mcp/"), vec![
            "https://mcp.example.com/.well-known/oauth-protected-resource/v1/mcp",
            "https://mcp.example.com/.well-known/oauth-protected-resource",
        ]);
        assert_eq!(resource_metadata_urls("https://mcp.example.com"), vec!["https://mcp.example.com/.well-known/oauth-protected-resource"]);
        assert_eq!(auth_server_metadata_urls("https://auth.example.com/tenant")[0], "https://auth.example.com/.well-known/oauth-authorization-server/tenant");
    }

    #[test]
    fn reads_the_metadata_a_401_points_at() {
        assert_eq!(
            resource_metadata_from_challenge(r#"Bearer error="invalid_token", resource_metadata="https://x.dev/.well-known/oauth-protected-resource""#).as_deref(),
            Some("https://x.dev/.well-known/oauth-protected-resource"),
        );
        assert_eq!(resource_metadata_from_challenge("Bearer realm=x"), None);
    }

    #[test]
    fn authorize_url_carries_pkce_state_and_resource_encoded() {
        let url = authorize_url(&AuthorizeParams {
            endpoint: "https://auth.dev/authorize",
            client_id: "c 1",
            redirect_uri: "http://127.0.0.1:5000/callback",
            challenge: "abc",
            state: "s",
            resource: "https://mcp.dev/mcp",
            scope: Some("read write"),
        });
        assert!(url.starts_with("https://auth.dev/authorize?response_type=code&client_id=c%201&"));
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A5000%2Fcallback"));
        assert!(url.contains("code_challenge=abc&code_challenge_method=S256&state=s"));
        assert!(url.contains("resource=https%3A%2F%2Fmcp.dev%2Fmcp"));
        assert!(url.ends_with("scope=read%20write"));
    }

    #[test]
    fn parses_the_callback_and_the_refusal() {
        assert_eq!(parse_callback("GET /callback?code=a%2Fb&state=xyz HTTP/1.1").unwrap(), ("a/b".to_string(), "xyz".to_string()));
        assert!(parse_callback("GET /callback?error=access_denied&state=x HTTP/1.1").unwrap_err().contains("access_denied"));
        assert!(parse_callback("GET /callback?state=x HTTP/1.1").is_err());
    }

    #[test]
    fn chunks_fit_the_keychain_and_put_back_together() {
        let long = "é".repeat(3000) + &"x".repeat(1234);
        let parts = chunks(&long);
        assert!(parts.iter().all(|p| p.len() <= CHUNK));
        assert_eq!(parts.concat(), long);
        assert_eq!(chunks(""), vec![String::new()]);
    }

    #[test]
    fn refreshes_only_what_is_about_to_expire() {
        let base = Stored { client_id: "c".into(), client_secret: None, token_endpoint: "t".into(), resource: "r".into(), access_token: "a".into(), refresh_token: None, expires_at: Some(1_000) };
        assert!(!needs_refresh(&base, 100));
        assert!(needs_refresh(&base, 950));
        assert!(!needs_refresh(&Stored { expires_at: None, ..base }, 999_999));
    }

    /// The whole flow against a local stand-in for an MCP server and its authorization server:
    /// discovery, registration, the browser's round trip, the code exchange, and a refresh.
    #[test]
    fn signs_in_end_to_end_and_refreshes() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            use axum::{routing::{get, post}, Json, Router};
            use std::sync::{Arc, Mutex};
            let seen: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(vec![]));
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let base = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
            let b1 = base.clone();
            let b2 = base.clone();
            let seen_token = seen.clone();
            let app = Router::new()
                .route("/.well-known/oauth-protected-resource/mcp", get(move || { let b = b1.clone(); async move { Json(serde_json::json!({ "resource": format!("{b}/mcp"), "authorization_servers": [b] })) } }))
                .route("/.well-known/oauth-authorization-server", get(move || { let b = b2.clone(); async move { Json(serde_json::json!({
                    "authorization_endpoint": format!("{b}/authorize"), "token_endpoint": format!("{b}/token"),
                    "registration_endpoint": format!("{b}/register"), "scopes_supported": ["mcp"],
                })) } }))
                .route("/register", post(|| async { Json(serde_json::json!({ "client_id": "client-1" })) }))
                .route("/token", post(move |body: String| { let seen = seen_token.clone(); async move {
                    seen.lock().unwrap().push(body.clone());
                    if body.contains("grant_type=refresh_token") {
                        Json(serde_json::json!({ "access_token": "access-2", "expires_in": 3600 }))
                    } else {
                        Json(serde_json::json!({ "access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 1 }))
                    }
                } }));
            tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

            // The "browser": follows the authorize URL straight back to the redirect with a code.
            let stored = sign_in(&format!("{base}/mcp"), "done", |authorize| {
                assert!(authorize.contains("code_challenge_method=S256"));
                assert!(authorize.contains("client_id=client-1"));
                assert!(authorize.contains("scope=mcp"));
                let query = authorize.split_once('?').unwrap().1;
                let get = |k: &str| query.split('&').find_map(|p| p.strip_prefix(&format!("{k}="))).map(unpct).unwrap();
                let redirect = format!("{}?code=the-code&state={}", get("redirect_uri"), pct(&get("state")));
                std::thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    rt.block_on(async { reqwest::get(redirect).await.unwrap().text().await.unwrap() })
                });
                Ok(())
            }).await.unwrap();

            assert_eq!(stored.access_token, "access-1");
            assert_eq!(stored.refresh_token.as_deref(), Some("refresh-1"));
            assert_eq!(stored.client_id, "client-1");
            let exchange = seen.lock().unwrap()[0].clone();
            assert!(exchange.contains("grant_type=authorization_code") && exchange.contains("code=the-code") && exchange.contains("code_verifier="));

            // It expires in a second: handing it out refreshes it, and the refresh token is kept.
            let (fresh_one, refreshed) = fresh(stored).await.unwrap();
            assert!(refreshed);
            assert_eq!(fresh_one.access_token, "access-2");
            assert_eq!(fresh_one.refresh_token.as_deref(), Some("refresh-1"));
        });
    }
}


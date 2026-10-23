//! LAN remote access for the desktop app: an axum HTTP server that serves the mobile page,
//! streams state snapshots over SSE and bridges commands to the webview (which owns the
//! orchestrator state) through Tauri events. Same protocol as src/lib/remote-node.ts.

use axum::{
    extract::{DefaultBodyLimit, State},
    http::{header, HeaderMap, StatusCode},
    response::{sse::{Event, KeepAlive, Sse}, Html, IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::convert::Infallible;
use std::io::Write;
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State as TauriState};
use tokio::sync::{broadcast, oneshot};
use tokio_stream::{wrappers::BroadcastStream, StreamExt};

use crate::logging;

/// The phone page, built by `npm run build:remote` into one self-contained HTML file.
/// `build.rs` leaves a placeholder there when it is missing, so a fresh clone still compiles.
const PAGE: &str = include_str!("../../dist-remote/index.html");
/// The desktop shell page, built into a separate single-file bundle.
const DESKTOP_PAGE: &str = include_str!("../../dist-remote/desktop.html");
/// What an installed app needs beside the page: the manifest, the icon it names, and the service
/// worker that shows a notification and knows where to take you when it is tapped. They are plain
/// files (nothing to bundle), so they come straight from the source tree.
const MANIFEST: &str = include_str!("../../src/remote/public/manifest.webmanifest");
const SERVICE_WORKER: &str = include_str!("../../src/remote/public/sw.js");
const ICON: &[u8] = include_bytes!("../../src/remote/public/icon.png");
const COMMAND_TIMEOUT: Duration = Duration::from_secs(15);

struct Inner {
    token: String,
    /// The last snapshot pushed, kept as the JSON text it arrived as: every reader of it writes it
    /// to a socket, so parsing it into a `Value` would only be work to undo.
    snapshot: RwLock<String>,
    tx: broadcast::Sender<String>,
    pending: Mutex<HashMap<String, oneshot::Sender<Value>>>,
    app: Option<AppHandle>,
}

struct Server {
    inner: Arc<Inner>,
    task: tauri::async_runtime::JoinHandle<()>,
    url: String,
    ip: String,
}

#[derive(Default)]
pub struct RemoteState {
    server: Mutex<Option<Server>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub url: String,
    pub ip: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStatus {
    pub running: bool,
    pub url: Option<String>,
    pub ip: Option<String>,
    pub clients: usize,
}

fn authorized_parts(token: &str, headers: &HeaderMap, query_or_token: Option<&str>) -> bool {
    if let Some(q) = query_or_token {
        for pair in q.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == "token" && v == token {
                    return true;
                }
            }
        }
    }
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|t| t == token)
        .unwrap_or(false)
}

fn unauthorized() -> Response {
    (StatusCode::UNAUTHORIZED, Json(json!({ "error": "Token inválido" }))).into_response()
}

/// The token check in front of `/api/`, before any body is read. It takes the token alone, not
/// `Inner`: a test of it then links no `AppHandle`, and with one the Windows test binary does not
/// load at all (0xc0000139) — Tauri needs the app's manifest, which only the app binary has.
async fn auth_middleware(
    State(token): State<Arc<str>>,
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    if !authorized_parts(&token, req.headers(), req.uri().query()) {
        return unauthorized();
    }
    next.run(req).await
}

/// The page is served to whoever asks, unlike everything under `/api/`.
///
/// It carries no data of its own — the snapshot, the commands and the events all stay behind the
/// token — and it is what asks for the token when the link did not bring one. Gated, a phone that
/// opens the bare address (an installed app launches its start URL with no query string) was
/// answered with a raw `{"error":"Token inválido"}` and had nowhere to type it.
async fn page(headers: HeaderMap) -> Response {
    if accepts_gzip(&headers) {
        return (
            [
                (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                (header::CONTENT_ENCODING, "gzip"),
                (header::CACHE_CONTROL, "no-store"),
                // Anything between here and the phone (the tunnel, a proxy) has to know that the
                // answer depends on what the client said it accepts.
                (header::VARY, "Accept-Encoding"),
            ],
            gzipped_page().clone(),
        )
            .into_response();
    }
    ([(header::CACHE_CONTROL, "no-store")], Html(PAGE)).into_response()
}

async fn manifest() -> Response {
    (
        [
            (header::CONTENT_TYPE, "application/manifest+json; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        MANIFEST,
    )
        .into_response()
}

async fn service_worker() -> Response {
    (
        [
            (header::CONTENT_TYPE, "text/javascript; charset=utf-8"),
            // The browser keeps its own copy of a worker; `no-store` is what makes an update of
            // the app reach a phone that already has one installed.
            (header::CACHE_CONTROL, "no-store"),
        ],
        SERVICE_WORKER,
    )
        .into_response()
}

async fn icon() -> Response {
    (
        [
            (header::CONTENT_TYPE, "image/png"),
            (header::CACHE_CONTROL, "max-age=86400"),
        ],
        ICON,
    )
        .into_response()
}

/// Whether the client asked for gzip. `identity;q=0` and friends are not worth parsing: a browser
/// that names gzip at all takes it, and one that does not gets the page as it is.
fn accepts_gzip(headers: &HeaderMap) -> bool {
    headers
        .get(header::ACCEPT_ENCODING)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|value| value.to_ascii_lowercase().split(',').any(|part| part.trim().starts_with("gzip")))
}

/// The page, compressed once and kept.
///
/// It is a megabyte of single-file bundle and it travels: over the LAN, or through the tunnel to a
/// phone on mobile data. Compressing it takes it to about a third, and it is the same bytes every
/// time, so it is done once for the life of the process rather than per request.
fn gzipped_page() -> &'static Vec<u8> {
    static COMPRESSED: OnceLock<Vec<u8>> = OnceLock::new();
    COMPRESSED.get_or_init(|| {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        // A failure here would mean the page cannot be served at all, so fall back to the raw
        // bytes: the header is only set on the branch that reaches this, which cannot happen.
        let _ = encoder.write_all(PAGE.as_bytes());
        encoder.finish().unwrap_or_else(|_| PAGE.as_bytes().to_vec())
    })
}

fn gzipped_desktop_page() -> &'static Vec<u8> {
    static COMPRESSED: OnceLock<Vec<u8>> = OnceLock::new();
    COMPRESSED.get_or_init(|| {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        let _ = encoder.write_all(DESKTOP_PAGE.as_bytes());
        encoder.finish().unwrap_or_else(|_| DESKTOP_PAGE.as_bytes().to_vec())
    })
}

async fn desktop_page(headers: HeaderMap) -> Response {
    if accepts_gzip(&headers) {
        return (
            [
                (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                (header::CONTENT_ENCODING, "gzip"),
                (header::CACHE_CONTROL, "no-store"),
                (header::VARY, "Accept-Encoding"),
            ],
            gzipped_desktop_page().clone(),
        )
            .into_response();
    }
    (
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        Html(DESKTOP_PAGE),
    )
        .into_response()
}

async fn state_handler(State(inner): State<Arc<Inner>>) -> Response {
    let snap = inner.snapshot.read().map(|s| s.clone()).unwrap_or_else(|_| "null".into());
    ([(header::CONTENT_TYPE, "application/json; charset=utf-8")], snap).into_response()
}

async fn events(State(inner): State<Arc<Inner>>) -> Response {
    let first = inner.snapshot.read().map(|s| s.clone()).unwrap_or_else(|_| "null".into());
    let rx = inner.tx.subscribe();
    let initial = tokio_stream::once(Ok::<Event, Infallible>(Event::default().event("state").data(first)));
    let inner_updates = inner.clone();
    let updates = BroadcastStream::new(rx).map(move |item| match item {
        Ok(data) => Ok::<Event, Infallible>(Event::default().event("state").data(data)),
        Err(_) => {
            // When a client lags behind (e.g. backgrounded or slow network) and drops broadcast frames,
            // push the latest snapshot directly from memory rather than waiting for another event that
            // may not arrive, ensuring the phone remote never stays stale.
            let latest = inner_updates
                .snapshot
                .read()
                .map(|s| s.clone())
                .unwrap_or_else(|_| "null".into());
            Ok(Event::default().event("state").data(latest))
        }
    });
    Sse::new(initial.chain(updates))
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(20)).event(Event::default().event("ping").data("{}")))
        .into_response()
}

async fn dispatch(inner: &Inner, action: &str, payload: Value) -> Value {
    let id = uuid_like();
    let (tx, rx) = oneshot::channel::<Value>();
    inner.pending.lock().unwrap().insert(id.clone(), tx);
    let cmd = json!({ "id": id, "action": action, "payload": payload });
    let app = match &inner.app {
        Some(a) => a,
        None => {
            inner.pending.lock().unwrap().remove(&id);
            return json!({ "error": "App no disponible" });
        }
    };
    if let Err(e) = app.emit("remote-command", cmd) {
        inner.pending.lock().unwrap().remove(&id);
        return json!({ "error": format!("No se pudo enviar el comando a la app: {e}") });
    }
    match tokio::time::timeout(COMMAND_TIMEOUT, rx).await {
        Ok(Ok(v)) => v,
        Ok(Err(_)) => json!({ "error": "La app no respondió" }),
        Err(_) => {
            inner.pending.lock().unwrap().remove(&id);
            json!({ "error": "La app tardó demasiado en responder" })
        }
    }
}

fn uuid_like() -> String {
    // Enough for correlating requests; avoids pulling the uuid crate.
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}-{:x}", rand_u32())
}

fn rand_u32() -> u32 {
    use std::sync::atomic::{AtomicU32, Ordering};
    static SEED: AtomicU32 = AtomicU32::new(0x9E37_79B9);
    let mut x = SEED.load(Ordering::Relaxed);
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    SEED.store(x, Ordering::Relaxed);
    x
}

macro_rules! command_route {
    ($name:ident, $action:literal) => {
        async fn $name(
            State(inner): State<Arc<Inner>>,
            body: Option<Json<Value>>,
        ) -> Response {
            let payload = body.map(|Json(v)| v).unwrap_or_else(|| json!({}));
            let result = dispatch(&inner, $action, payload).await;
            let status = if result.get("error").is_some() { StatusCode::BAD_REQUEST } else { StatusCode::OK };
            (status, Json(result)).into_response()
        }
    };
}

command_route!(cmd_prompt, "prompt");
command_route!(cmd_instruct, "instruct");
command_route!(cmd_stop, "stop");
command_route!(cmd_approve, "approve");
command_route!(cmd_chat, "chat");
command_route!(cmd_task, "task");
command_route!(cmd_answer, "answer");
command_route!(cmd_agent, "agent");
command_route!(cmd_diagnostics, "diagnostics");
command_route!(cmd_fs, "fs");
command_route!(cmd_project, "project");
command_route!(cmd_settings, "settings");

async fn not_found() -> Response {
    (StatusCode::NOT_FOUND, Json(json!({ "error": "No encontrado" }))).into_response()
}

fn local_ip() -> String {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

fn build_router(inner: Arc<Inner>) -> Router {
    let api_routes = Router::new()
        .route("/state", get(state_handler))
        .route("/events", get(events))
        .route("/prompt", post(cmd_prompt))
        .route("/instruct", post(cmd_instruct))
        .route("/stop", post(cmd_stop))
        .route("/approve", post(cmd_approve))
        .route("/chat", post(cmd_chat))
        .route("/answer", post(cmd_answer))
        .route("/task", post(cmd_task))
        .route("/agent", post(cmd_agent))
        .route("/diagnostics", post(cmd_diagnostics))
        .route("/fs", post(cmd_fs).layer(DefaultBodyLimit::max(40 * 1024 * 1024)))
        .route("/project", post(cmd_project))
        // A whole list of skills (their text included) or a notification sound travels in one patch.
        .route("/settings", post(cmd_settings).layer(DefaultBodyLimit::max(10 * 1024 * 1024)))
        .layer(axum::middleware::from_fn_with_state(Arc::<str>::from(inner.token.as_str()), auth_middleware));

    Router::new()
        .route("/", get(page))
        .route("/desktop", get(desktop_page))
        // Open, like the page: a manifest behind a token is a manifest the browser cannot read,
        // and without it what you install to the home screen is a bookmark.
        .route("/manifest.webmanifest", get(manifest))
        .route("/sw.js", get(service_worker))
        .route("/icon.png", get(icon))
        .nest("/api", api_routes)
        .fallback(not_found)
        .with_state(inner)
}

#[tauri::command]
pub async fn remote_start(app: AppHandle, state: TauriState<'_, RemoteState>, port: u16, token: String) -> Result<RemoteInfo, String> {
    if let Some(s) = state.server.lock().unwrap().as_ref() {
        return Ok(RemoteInfo { url: s.url.clone(), ip: s.ip.clone() });
    }
    if token.trim().is_empty() {
        return Err("Falta el token".into());
    }
    let (tx, _rx) = broadcast::channel::<String>(64);
    let inner = Arc::new(Inner {
        token: token.clone(),
        snapshot: RwLock::new("null".to_string()),
        tx,
        pending: Mutex::new(HashMap::new()),
        app: Some(app),
    });
    let router = build_router(inner.clone());

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .map_err(|e| {
            let msg = if e.kind() == std::io::ErrorKind::AddrInUse { format!("El puerto {port} está ocupado") } else { e.to_string() };
            if let Some(app) = &inner.app {
                logging::append(app, "error", "remote", &format!("could not listen on port {port}: {msg}"));
            }
            msg
        })?;
    let task = tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });
    let ip = local_ip();
    let url = format!("http://{ip}:{port}/?token={}", urlencode(&token));
    if let Some(app) = &inner.app {
        logging::append(app, "info", "remote", &format!("servidor remoto escuchando en {ip}:{port}"));
    }
    *state.server.lock().unwrap() = Some(Server { inner, task, url: url.clone(), ip: ip.clone() });
    Ok(RemoteInfo { url, ip })
}

fn urlencode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => c.to_string().bytes().map(|b| format!("%{b:02X}")).collect(),
        })
        .collect()
}

#[tauri::command]
pub fn remote_stop(app: AppHandle, state: TauriState<'_, RemoteState>) -> Result<(), String> {
    if let Some(s) = state.server.lock().unwrap().take() {
        s.task.abort();
        logging::append(&app, "info", "remote", "servidor remoto detenido");
    }
    Ok(())
}

#[tauri::command]
pub fn remote_status(state: TauriState<'_, RemoteState>) -> RemoteStatus {
    match state.server.lock().unwrap().as_ref() {
        Some(s) => RemoteStatus {
            running: true,
            url: Some(s.url.clone()),
            ip: Some(s.ip.clone()),
            clients: s.inner.tx.receiver_count(),
        },
        None => RemoteStatus { running: false, url: None, ip: None, clients: 0 },
    }
}

#[tauri::command]
pub fn remote_push_state(state: TauriState<'_, RemoteState>, snapshot: String) -> Result<(), String> {
    if let Some(s) = state.server.lock().unwrap().as_ref() {
        if let Ok(mut snap) = s.inner.snapshot.write() {
            // Reuses the buffer already there: snapshots come in at up to three a second.
            snap.clone_from(&snapshot);
        }
        let _ = s.inner.tx.send(snapshot);
    }
    Ok(())
}

#[tauri::command]
pub fn remote_reply(state: TauriState<'_, RemoteState>, id: String, result: Value) -> Result<(), String> {
    if let Some(s) = state.server.lock().unwrap().as_ref() {
        if let Some(tx) = s.inner.pending.lock().unwrap().remove(&id) {
            let _ = tx.send(result);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{accepts_gzip, gzipped_page, PAGE};
    use axum::http::{header, HeaderMap, HeaderValue};
    use flate2::read::GzDecoder;
    use std::io::Read;

    fn headers(accept_encoding: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(header::ACCEPT_ENCODING, HeaderValue::from_str(accept_encoding).unwrap());
        headers
    }

    #[test]
    fn only_compresses_for_a_client_that_asked() {
        assert!(accepts_gzip(&headers("gzip, deflate, br")));
        assert!(accepts_gzip(&headers("br;q=1.0, gzip;q=0.8")));
        assert!(accepts_gzip(&headers("GZIP")));
        assert!(!accepts_gzip(&headers("br, zstd")));
        assert!(!accepts_gzip(&headers("")));
        // A client that says nothing gets the page as it is.
        assert!(!accepts_gzip(&HeaderMap::new()));
    }

    #[test]
    fn what_is_sent_is_the_page() {
        let compressed = gzipped_page();
        let mut decoded = String::new();
        GzDecoder::new(&compressed[..]).read_to_string(&mut decoded).unwrap();
        assert_eq!(decoded, PAGE);
        // Worth the trouble: the bundle is a megabyte and it travels to a phone.
        assert!(compressed.len() < PAGE.len() / 2, "{} vs {}", compressed.len(), PAGE.len());
    }

    #[test]
    fn authorized_parts_validates_token_header_and_query() {
        let token = "my-secret-123";
        let empty_headers = HeaderMap::new();

        assert!(!super::authorized_parts(token, &empty_headers, Some("my-secret-123")));
        assert!(super::authorized_parts(token, &empty_headers, Some("token=my-secret-123")));
        assert!(super::authorized_parts(token, &empty_headers, Some("foo=bar&token=my-secret-123")));
        assert!(!super::authorized_parts(token, &empty_headers, Some("token=wrong")));
        assert!(!super::authorized_parts(token, &empty_headers, None));

        let mut auth_headers = HeaderMap::new();
        auth_headers.insert(header::AUTHORIZATION, HeaderValue::from_str("Bearer my-secret-123").unwrap());
        assert!(super::authorized_parts(token, &auth_headers, None));

        let mut bad_headers = HeaderMap::new();
        bad_headers.insert(header::AUTHORIZATION, HeaderValue::from_str("Bearer wrong").unwrap());
        assert!(!super::authorized_parts(token, &bad_headers, None));
    }

    #[tokio::test]
    async fn unauthenticated_request_rejected_without_reading_large_body() {
        use axum::body::Body;
        use axum::extract::DefaultBodyLimit;
        use axum::http::{Request, StatusCode};
        use axum::routing::post;
        use std::sync::Arc;
        use tower::ServiceExt;

        // The middleware in front of a stand-in route, as `build_router` puts it in front of
        // `/api/fs`. Not the real router: its handlers reach the `AppHandle`, and linking that
        // keeps the Windows test binary from loading (see `auth_middleware`).
        let router = axum::Router::new()
            .route("/api/fs", post(|| async { "read" }).layer(DefaultBodyLimit::max(40 * 1024 * 1024)))
            .layer(axum::middleware::from_fn_with_state(Arc::<str>::from("secret-token"), super::auth_middleware));

        let request = Request::builder()
            .method("POST")
            .uri("/api/fs")
            .header("Content-Type", "application/json")
            .body(Body::from(vec![b'a'; 5 * 1024 * 1024]))
            .unwrap();
        let res = router.clone().oneshot(request).await.unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

        // And with the token it goes through: the check is the token, not a door that stays shut.
        let request = Request::builder()
            .method("POST")
            .uri("/api/fs?token=secret-token")
            .body(Body::from("{}"))
            .unwrap();
        let res = router.oneshot(request).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }
}

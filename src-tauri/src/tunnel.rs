//! Public tunnel for the remote access: runs `cloudflared` or `ngrok` as a hidden child
//! process pointing at the local LAN server and captures the public URL it prints.
//! Same protocol as the node implementation in src/lib/tunnel-node.ts.

use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, State as TauriState};

use crate::logging;

const URL_TIMEOUT: Duration = Duration::from_secs(30);
const NAMED_TUNNEL_URL_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Default)]
pub struct TunnelState {
    child: Mutex<Option<Child>>,
    url: Mutex<Option<String>>,
    provider: Mutex<Option<String>>,
    fixed: Mutex<bool>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TunnelInfo {
    pub url: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TunnelStatus {
    pub running: bool,
    pub url: Option<String>,
    pub provider: Option<String>,
    pub fixed: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TunnelDetect {
    pub cloudflared: Option<String>,
    pub ngrok: Option<String>,
}

fn binary_for(provider: &str) -> &'static str {
    if provider == "ngrok" {
        "ngrok"
    } else {
        "cloudflared"
    }
}

/// `https://Algo.Ngrok-Free.App/` → `algo.ngrok-free.app`. Empty when nothing is left.
fn normalize_domain(input: Option<&str>) -> String {
    let raw = match input {
        Some(s) if !s.trim().is_empty() => s.trim(),
        _ => return String::new(),
    };
    let lower = raw.to_lowercase();
    let no_scheme = lower
        .strip_prefix("https://")
        .or_else(|| lower.strip_prefix("http://"))
        .unwrap_or(&lower);
    let end = no_scheme
        .find(['/', '?', '#'])
        .unwrap_or(no_scheme.len());
    no_scheme[..end].trim_end_matches('/').to_string()
}

/// true when the config is enough for a fixed URL with that provider.
fn has_fixed_url(provider: &str, domain: Option<&str>, tunnel_name: Option<&str>) -> bool {
    if normalize_domain(domain).is_empty() {
        return false;
    }
    if provider == "ngrok" {
        return true;
    }
    tunnel_name.map(|n| !n.trim().is_empty()).unwrap_or(false)
}

/// Public URL the tunnel will have when the config is fixed, or None.
fn fixed_url(provider: &str, domain: Option<&str>, tunnel_name: Option<&str>) -> Option<String> {
    if !has_fixed_url(provider, domain, tunnel_name) {
        return None;
    }
    Some(format!("https://{}", normalize_domain(domain)))
}

#[tauri::command]
pub fn tunnel_detect() -> TunnelDetect {
    TunnelDetect {
        cloudflared: crate::detect::find_path("cloudflared"),
        ngrok: crate::detect::find_path("ngrok"),
    }
}

#[tauri::command]
pub async fn tunnel_start(
    app: AppHandle,
    state: TauriState<'_, TunnelState>,
    provider: String,
    port: u16,
    domain: Option<String>,
    tunnel_name: Option<String>,
) -> Result<TunnelInfo, String> {
    // Already up: return the URL we have instead of spawning a second process.
    if let Some(url) = current_url(&state) {
        return Ok(TunnelInfo { url });
    }
    let provider = if provider == "ngrok" { "ngrok" } else { "cloudflared" }.to_string();
    let program = crate::detect::find_path(binary_for(&provider))
        .ok_or_else(|| format!("No se encontró `{}`. Instalalo y volvé a detectar.", binary_for(&provider)))?;

    logging::append(&app, "info", "tunnel", &format!("iniciando túnel {provider} en el puerto {port} ({program})"));

    let p = provider.clone();
    let d = domain.clone();
    let tn = tunnel_name.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        start_process(&program, &p, port, d.as_deref(), tn.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?;

    match result {
        Ok((child, url)) => {
            // A concurrent start won the race: keep the first one and kill this extra process.
            if let Some(existing) = current_url(&state) {
                kill_child(child);
                return Ok(TunnelInfo { url: existing });
            }
            *state.child.lock().unwrap() = Some(child);
            *state.url.lock().unwrap() = Some(url.clone());
            *state.provider.lock().unwrap() = Some(provider.clone());
            *state.fixed.lock().unwrap() = has_fixed_url(&provider, domain.as_deref(), tunnel_name.as_deref());
            logging::append(&app, "info", "tunnel", &format!("túnel activo en {url}"));
            Ok(TunnelInfo { url })
        }
        Err(e) => {
            logging::append(&app, "error", "tunnel", &format!("no se pudo abrir el túnel: {e}"));
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn tunnel_stop(app: AppHandle, state: TauriState<'_, TunnelState>) -> Result<(), String> {
    let child = state.child.lock().unwrap().take();
    *state.url.lock().unwrap() = None;
    *state.provider.lock().unwrap() = None;
    *state.fixed.lock().unwrap() = false;
    if let Some(c) = child {
        // `taskkill /T /F` can take a moment: keep it off the main thread.
        let _ = tauri::async_runtime::spawn_blocking(move || kill_child(c)).await;
        logging::append(&app, "info", "tunnel", "túnel detenido");
    }
    Ok(())
}

/// Clears the stored child when the tunnel process died on its own, so the UI can show
/// "Se cayó el túnel" and a start does not hand back a dead URL. Returns whether it is alive.
fn reap(state: &TauriState<'_, TunnelState>) -> bool {
    let mut died = false;
    if let Ok(mut guard) = state.child.lock() {
        if let Some(child) = guard.as_mut() {
            if matches!(child.try_wait(), Ok(Some(_)) | Err(_)) {
                *guard = None;
                died = true;
            }
        }
    }
    if died {
        *state.url.lock().unwrap() = None;
        *state.provider.lock().unwrap() = None;
        *state.fixed.lock().unwrap() = false;
    }
    state.child.lock().unwrap().is_some()
}

#[tauri::command]
pub fn tunnel_status(state: TauriState<'_, TunnelState>) -> TunnelStatus {
    let running = reap(&state);
    TunnelStatus {
        running,
        url: if running { state.url.lock().unwrap().clone() } else { None },
        provider: state.provider.lock().unwrap().clone(),
        fixed: if running { *state.fixed.lock().unwrap() } else { false },
    }
}

/// Kills the tunnel when the app exits, so no orphan cloudflared/ngrok is left behind.
pub fn shutdown(app: &AppHandle) {
    use tauri::Manager;
    if let Some(state) = app.try_state::<TunnelState>() {
        let child = state.child.lock().ok().and_then(|mut g| g.take());
        if let Some(c) = child {
            kill_child(c);
        }
    }
}

fn current_url(state: &TauriState<'_, TunnelState>) -> Option<String> {
    if reap(state) {
        state.url.lock().unwrap().clone()
    } else {
        None
    }
}

fn kill_child(mut child: Child) {
    #[cfg(windows)]
    {
        // cloudflared and ngrok can spawn helpers: kill the whole tree.
        let pid = child.id();
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Spawns the tunnel binary and blocks until it prints a public URL (or fails / times out).
fn start_process(
    program: &str,
    provider: &str,
    port: u16,
    domain: Option<&str>,
    tunnel_name: Option<&str>,
) -> Result<(Child, String), String> {
    let mut cmd = Command::new(program);
    if provider == "ngrok" {
        let d = normalize_domain(domain);
        if d.is_empty() {
            cmd.args(["http", &port.to_string(), "--log=stdout", "--log-format=json"]);
        } else {
            cmd.args(["http", &port.to_string(), "--log=stdout", "--log-format=json", "--url", &format!("https://{d}")]);
        }
    } else if has_fixed_url(provider, domain, tunnel_name) {
        cmd.args(["tunnel", "--url", &format!("http://127.0.0.1:{port}"), "run", tunnel_name.unwrap().trim()]);
    } else {
        cmd.args(["tunnel", "--url", &format!("http://127.0.0.1:{port}")]);
    }
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("No se pudo iniciar `{program}`: {e}"))?;

    let (tx, rx) = mpsc::channel::<String>();
    // cloudflared prints the quick-tunnel URL on stderr, ngrok on stdout: read both.
    for reader in [
        child.stdout.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
        child.stderr.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
    ]
    .into_iter()
    .flatten()
    {
        let tx = tx.clone();
        thread::spawn(move || {
            for line in BufReader::new(reader).lines() {
                match line {
                    Ok(l) => {
                        if tx.send(l).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }
    drop(tx);

    // A named cloudflared tunnel takes a bit longer to register its connections.
    let timeout = if provider != "ngrok" && has_fixed_url(provider, domain, tunnel_name) {
        NAMED_TUNNEL_URL_TIMEOUT
    } else {
        URL_TIMEOUT
    };
    let deadline = Instant::now() + timeout;
    let mut tail: Vec<String> = Vec::new();
    loop {
        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(line) => {
                if let Some(url) = extract_url(provider, &line, domain, tunnel_name) {
                    return Ok((child, url));
                }
                if !line.trim().is_empty() {
                    tail.push(line);
                    if tail.len() > 8 {
                        tail.remove(0);
                    }
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if let Ok(Some(status)) = child.try_wait() {
                    return Err(exit_message(provider, status.code(), &tail));
                }
                if Instant::now() > deadline {
                    kill_child(child);
                    return Err(format!(
                        "`{provider}` no publicó una URL en {} s. Últimas líneas: {}",
                        timeout.as_secs(),
                        tail.join(" | ")
                    ));
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                let code = child.wait().ok().and_then(|s| s.code());
                return Err(exit_message(provider, code, &tail));
            }
        }
    }
}

fn exit_message(provider: &str, code: Option<i32>, tail: &[String]) -> String {
    let joined_lower = tail.join(" ").to_lowercase();
    let mut hint = String::new();
    if provider == "ngrok" {
        if tail.iter().any(|l| l.contains("authtoken")) {
            hint.push_str(" Configurá tu cuenta con `ngrok config add-authtoken <token>`.");
        } else if joined_lower.contains("domain")
            && (joined_lower.contains("not found")
                || joined_lower.contains("not authorized")
                || joined_lower.contains("err_ngrok_3200"))
        {
            hint.push_str(" Ese dominio no está en tu cuenta de ngrok: reclamalo en dashboard.ngrok.com → Domains.");
        }
    } else if joined_lower.contains("origincertificate")
        || joined_lower.contains("cert.pem")
        || joined_lower.contains("credentials file")
        || joined_lower.contains("tunnel credentials")
    {
        hint.push_str(" Falta configurar el named tunnel: corré `cloudflared tunnel login` y `cloudflared tunnel create <nombre>`.");
    }
    format!(
        "`{provider}` terminó{}.{hint} Últimas líneas: {}",
        code.map(|c| format!(" con código {c}")).unwrap_or_default(),
        tail.join(" | ")
    )
}

/// Pulls the public URL out of a log line: `https://x.trycloudflare.com` for cloudflared,
/// the `"url":"https://…"` field of ngrok's `started tunnel` JSON event for ngrok. With a
/// cloudflared named tunnel there is no URL printed: a line marking the connection as
/// registered means the fixed URL is up.
pub fn extract_url(provider: &str, line: &str, domain: Option<&str>, tunnel_name: Option<&str>) -> Option<String> {
    if provider == "ngrok" {
        for marker in ["\"url\":\"", "\"url\": \""] {
            let mut rest = line;
            while let Some(idx) = rest.find(marker) {
                let after = &rest[idx + marker.len()..];
                let end = after.find('"').unwrap_or(after.len());
                let candidate = &after[..end];
                if candidate.starts_with("https://") {
                    return Some(candidate.to_string());
                }
                rest = after;
            }
        }
        return None;
    }
    if has_fixed_url(provider, domain, tunnel_name) {
        return if is_registered_connection_line(line) {
            fixed_url(provider, domain, tunnel_name)
        } else {
            None
        };
    }
    let mut rest = line;
    while let Some(idx) = rest.find("https://") {
        let after = &rest[idx..];
        let end = after
            .char_indices()
            .find(|(_, c)| !(c.is_ascii_alphanumeric() || *c == '-' || *c == '.' || *c == ':' || *c == '/'))
            .map(|(i, _)| i)
            .unwrap_or(after.len());
        let candidate = after[..end].trim_end_matches('/');
        if candidate.ends_with(".trycloudflare.com") {
            return Some(candidate.to_string());
        }
        rest = &after[8..];
    }
    None
}

/// Mirrors `/registered tunnel connection/i` and `/connection [0-9a-f-]{8,} registered/i`
/// without pulling in a regex crate.
fn is_registered_connection_line(line: &str) -> bool {
    let lower = line.to_lowercase();
    if lower.contains("registered tunnel connection") {
        return true;
    }
    let words: Vec<&str> = lower.split_whitespace().collect();
    for i in 0..words.len() {
        let w = words[i].trim_matches(|c: char| !c.is_ascii_alphanumeric());
        if w != "connection" || i + 2 >= words.len() {
            continue;
        }
        let id = words[i + 1].trim_matches(|c: char| !(c.is_ascii_hexdigit() || c == '-'));
        let next = words[i + 2].trim_matches(|c: char| !c.is_ascii_alphanumeric());
        if id.len() >= 8 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') && next == "registered" {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::extract_url;

    #[test]
    fn finds_cloudflare_url() {
        let line = "2026-09-05T14:03:22Z INF |  https://silly-name-1234.trycloudflare.com  |";
        assert_eq!(
            extract_url("cloudflared", line, None, None).as_deref(),
            Some("https://silly-name-1234.trycloudflare.com")
        );
        assert_eq!(extract_url("cloudflared", "INF starting tunnel", None, None), None);
    }

    #[test]
    fn finds_ngrok_url() {
        let line = r#"{"addr":"http://127.0.0.1:4710","lvl":"info","msg":"started tunnel","url":"https://abc-1-2-3.ngrok-free.app"}"#;
        assert_eq!(
            extract_url("ngrok", line, None, None).as_deref(),
            Some("https://abc-1-2-3.ngrok-free.app")
        );
        assert_eq!(extract_url("ngrok", r#"{"url":"http://localhost:4040"}"#, None, None), None);
    }

    #[test]
    fn named_cloudflared_tunnel_uses_the_fixed_domain() {
        let domain = Some("x.midominio.com");
        let tunnel_name = Some("ainess");
        let line = "2026-09-05T14:05:00Z INF Registered tunnel connection connection=ab12cd34-ef56-7890-abcd-ef1234567890 location=EWR";
        assert_eq!(
            extract_url("cloudflared", line, domain, tunnel_name).as_deref(),
            Some("https://x.midominio.com")
        );
        assert_eq!(extract_url("cloudflared", "INF some unrelated line", domain, tunnel_name), None);
    }
}

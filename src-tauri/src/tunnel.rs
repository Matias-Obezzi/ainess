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

#[derive(Default)]
pub struct TunnelState {
    child: Mutex<Option<Child>>,
    url: Mutex<Option<String>>,
    provider: Mutex<Option<String>>,
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
    let result = tauri::async_runtime::spawn_blocking(move || start_process(&program, &p, port))
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
            *state.provider.lock().unwrap() = Some(provider);
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
pub fn tunnel_stop(app: AppHandle, state: TauriState<'_, TunnelState>) -> Result<(), String> {
    let child = state.child.lock().unwrap().take();
    *state.url.lock().unwrap() = None;
    *state.provider.lock().unwrap() = None;
    if let Some(c) = child {
        kill_child(c);
        logging::append(&app, "info", "tunnel", "túnel detenido");
    }
    Ok(())
}

#[tauri::command]
pub fn tunnel_status(state: TauriState<'_, TunnelState>) -> TunnelStatus {
    // Notice a tunnel that died on its own so the UI can offer "Reintentar".
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
    }
    let running = state.child.lock().unwrap().is_some();
    TunnelStatus {
        running,
        url: if running { state.url.lock().unwrap().clone() } else { None },
        provider: state.provider.lock().unwrap().clone(),
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
    if state.child.lock().unwrap().is_some() {
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
fn start_process(program: &str, provider: &str, port: u16) -> Result<(Child, String), String> {
    let mut cmd = Command::new(program);
    if provider == "ngrok" {
        cmd.args(["http", &port.to_string(), "--log=stdout", "--log-format=json"]);
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

    let deadline = Instant::now() + URL_TIMEOUT;
    let mut tail: Vec<String> = Vec::new();
    loop {
        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(line) => {
                if let Some(url) = extract_url(provider, &line) {
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
                        "`{provider}` no publicó una URL en 30 s. Últimas líneas: {}",
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
    let hint = if provider == "ngrok" && tail.iter().any(|l| l.contains("authtoken")) {
        " Configurá tu cuenta con `ngrok config add-authtoken <token>`."
    } else {
        ""
    };
    format!(
        "`{provider}` terminó{}.{hint} Últimas líneas: {}",
        code.map(|c| format!(" con código {c}")).unwrap_or_default(),
        tail.join(" | ")
    )
}

/// Pulls the public URL out of a log line: `https://x.trycloudflare.com` for cloudflared,
/// the `"url":"https://…"` field of ngrok's `started tunnel` JSON event for ngrok.
pub fn extract_url(provider: &str, line: &str) -> Option<String> {
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

#[cfg(test)]
mod tests {
    use super::extract_url;

    #[test]
    fn finds_cloudflare_url() {
        let line = "2026-09-05T14:03:22Z INF |  https://silly-name-1234.trycloudflare.com  |";
        assert_eq!(
            extract_url("cloudflared", line).as_deref(),
            Some("https://silly-name-1234.trycloudflare.com")
        );
        assert_eq!(extract_url("cloudflared", "INF starting tunnel"), None);
    }

    #[test]
    fn finds_ngrok_url() {
        let line = r#"{"addr":"http://127.0.0.1:4710","lvl":"info","msg":"started tunnel","url":"https://abc-1-2-3.ngrok-free.app"}"#;
        assert_eq!(
            extract_url("ngrok", line).as_deref(),
            Some("https://abc-1-2-3.ngrok-free.app")
        );
        assert_eq!(extract_url("ngrok", r#"{"url":"http://localhost:4040"}"#), None);
    }
}

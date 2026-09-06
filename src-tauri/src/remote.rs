//! LAN remote access for the desktop app: an axum HTTP server that serves the mobile page,
//! streams state snapshots over SSE and bridges commands to the webview (which owns the
//! orchestrator state) through Tauri events. Same protocol as src/lib/remote-node.ts.

use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{sse::{Event, KeepAlive, Sse}, Html, IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State as TauriState};
use tokio::sync::{broadcast, oneshot};
use tokio_stream::{wrappers::BroadcastStream, StreamExt};

use crate::logging;

/// The phone page, built by `npm run build:remote` into one self-contained HTML file.
/// `build.rs` leaves a placeholder there when it is missing, so a fresh clone still compiles.
const PAGE: &str = include_str!("../../dist-remote/index.html");
const COMMAND_TIMEOUT: Duration = Duration::from_secs(15);

struct Inner {
    token: String,
    snapshot: RwLock<Value>,
    tx: broadcast::Sender<String>,
    pending: Mutex<HashMap<String, oneshot::Sender<Value>>>,
    app: AppHandle,
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

#[derive(Deserialize)]
struct TokenQuery {
    token: Option<String>,
}

fn authorized(inner: &Inner, headers: &HeaderMap, q: &TokenQuery) -> bool {
    if q.token.as_deref() == Some(inner.token.as_str()) {
        return true;
    }
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|t| t == inner.token)
        .unwrap_or(false)
}

fn unauthorized() -> Response {
    (StatusCode::UNAUTHORIZED, Json(json!({ "error": "Token inválido" }))).into_response()
}

async fn page(State(inner): State<Arc<Inner>>, headers: HeaderMap, Query(q): Query<TokenQuery>) -> Response {
    if !authorized(&inner, &headers, &q) {
        return unauthorized();
    }
    ([(header::CACHE_CONTROL, "no-store")], Html(PAGE)).into_response()
}

async fn state_handler(State(inner): State<Arc<Inner>>, headers: HeaderMap, Query(q): Query<TokenQuery>) -> Response {
    if !authorized(&inner, &headers, &q) {
        return unauthorized();
    }
    let snap = inner.snapshot.read().map(|s| s.clone()).unwrap_or(Value::Null);
    Json(snap).into_response()
}

async fn events(State(inner): State<Arc<Inner>>, headers: HeaderMap, Query(q): Query<TokenQuery>) -> Response {
    if !authorized(&inner, &headers, &q) {
        return unauthorized();
    }
    let first = inner.snapshot.read().map(|s| s.to_string()).unwrap_or_else(|_| "null".into());
    let rx = inner.tx.subscribe();
    let initial = tokio_stream::once(Ok::<Event, Infallible>(Event::default().event("state").data(first)));
    let updates = BroadcastStream::new(rx).filter_map(|item| match item {
        Ok(data) => Some(Ok::<Event, Infallible>(Event::default().event("state").data(data))),
        Err(_) => None, // lagged: the next snapshot catches up
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
    if let Err(e) = inner.app.emit("remote-command", cmd) {
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
            headers: HeaderMap,
            Query(q): Query<TokenQuery>,
            body: Option<Json<Value>>,
        ) -> Response {
            if !authorized(&inner, &headers, &q) {
                return unauthorized();
            }
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

async fn not_found() -> Response {
    (StatusCode::NOT_FOUND, Json(json!({ "error": "No encontrado" }))).into_response()
}

fn local_ip() -> String {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

#[tauri::command]
pub async fn remote_start(app: AppHandle, state: TauriState<'_, RemoteState>, port: u16, token: String) -> Result<RemoteInfo, String> {
    if let Some(s) = state.server.lock().unwrap().as_ref() {
        return Ok(RemoteInfo { url: s.url.clone(), ip: s.ip.clone() });
    }
    if token.trim().is_empty() {
        return Err("Falta el token".into());
    }
    let (tx, _rx) = broadcast::channel::<String>(16);
    let inner = Arc::new(Inner {
        token: token.clone(),
        snapshot: RwLock::new(Value::Null),
        tx,
        pending: Mutex::new(HashMap::new()),
        app,
    });
    let router = Router::new()
        .route("/", get(page))
        .route("/api/state", get(state_handler))
        .route("/api/events", get(events))
        .route("/api/prompt", post(cmd_prompt))
        .route("/api/instruct", post(cmd_instruct))
        .route("/api/stop", post(cmd_stop))
        .route("/api/approve", post(cmd_approve))
        .route("/api/chat", post(cmd_chat))
        .route("/api/task", post(cmd_task))
        .fallback(not_found)
        .with_state(inner.clone());

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .map_err(|e| {
            let msg = if e.kind() == std::io::ErrorKind::AddrInUse { format!("El puerto {port} está ocupado") } else { e.to_string() };
            logging::append(&inner.app, "error", "remote", &format!("no se pudo escuchar en el puerto {port}: {msg}"));
            msg
        })?;
    let task = tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });
    let ip = local_ip();
    let url = format!("http://{ip}:{port}/?token={}", urlencode(&token));
    logging::append(&inner.app, "info", "remote", &format!("servidor remoto escuchando en {ip}:{port}"));
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
pub fn remote_push_state(state: TauriState<'_, RemoteState>, snapshot: Value) -> Result<(), String> {
    if let Some(s) = state.server.lock().unwrap().as_ref() {
        if let Ok(mut snap) = s.inner.snapshot.write() {
            *snap = snapshot.clone();
        }
        let _ = s.inner.tx.send(snapshot.to_string());
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

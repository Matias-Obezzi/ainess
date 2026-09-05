//! Integrated terminals: real PTY sessions (ConPTY on Windows) whose output is
//! streamed to the frontend as `pty-output` events and whose exit is announced as
//! `pty-exit`. Sessions are keyed by the id the frontend generates.

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::logging;

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyOutputEvent {
    pub id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyExitEvent {
    pub id: String,
    pub code: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    pub id: String,
    pub label: String,
    pub path: String,
}

fn push_shell(out: &mut Vec<ShellInfo>, id: &str, label: &str, path: PathBuf) {
    if out.iter().any(|s| s.id == id) {
        return;
    }
    if path.is_file() {
        out.push(ShellInfo {
            id: id.to_string(),
            label: label.to_string(),
            path: path.to_string_lossy().to_string(),
        });
    }
}

/// Shells detected on this machine, best first. Windows only lists the known set;
/// other systems fall back to `$SHELL` and the usual suspects.
#[tauri::command]
pub fn pty_list_shells() -> Vec<ShellInfo> {
    let mut out: Vec<ShellInfo> = Vec::new();

    #[cfg(windows)]
    {
        // PowerShell 7 is usually only reachable through the WindowsApps shim.
        if let Ok(p) = which::which("pwsh.exe") {
            push_shell(&mut out, "pwsh", "PowerShell", p);
        }
        if let Some(local) = dirs::data_local_dir() {
            push_shell(
                &mut out,
                "pwsh",
                "PowerShell",
                local.join("Microsoft").join("WindowsApps").join("pwsh.exe"),
            );
        }
        let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        push_shell(
            &mut out,
            "powershell",
            "Windows PowerShell",
            Path::new(&system_root)
                .join("System32")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe"),
        );
        push_shell(
            &mut out,
            "cmd",
            "cmd",
            Path::new(&system_root).join("System32").join("cmd.exe"),
        );
        push_shell(
            &mut out,
            "gitbash",
            "Git Bash",
            PathBuf::from("C:\\Program Files\\Git\\bin\\bash.exe"),
        );
        if let Some(local) = dirs::data_local_dir() {
            push_shell(
                &mut out,
                "gitbash",
                "Git Bash",
                local.join("Programs").join("Git").join("bin").join("bash.exe"),
            );
        }
    }

    #[cfg(not(windows))]
    {
        if let Ok(sh) = std::env::var("SHELL") {
            let path = PathBuf::from(&sh);
            let label = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "shell".to_string());
            push_shell(&mut out, "default", &label, path);
        }
        push_shell(&mut out, "bash", "bash", PathBuf::from("/bin/bash"));
        push_shell(&mut out, "sh", "sh", PathBuf::from("/bin/sh"));
    }

    out
}

/// Falls back to the home directory when the requested cwd no longer exists.
fn resolve_cwd(cwd: Option<String>) -> PathBuf {
    if let Some(c) = cwd {
        let p = PathBuf::from(&c);
        if !c.is_empty() && p.is_dir() {
            return p;
        }
    }
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyState>,
    id: String,
    shell: String,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), String> {
    if !Path::new(&shell).is_file() {
        let msg = format!("No se encontró el shell `{shell}`");
        logging::append(&app, "error", "pty", &format!("{id}: {msg}"));
        return Err(msg);
    }
    if state.sessions.lock().unwrap().contains_key(&id) {
        return Err(format!("La terminal {id} ya está abierta"));
    }

    let size = PtySize {
        rows: rows.unwrap_or(24).max(1),
        cols: cols.unwrap_or(80).max(1),
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = native_pty_system()
        .openpty(size)
        .map_err(|e| format!("No se pudo abrir la terminal: {e}"))?;

    let dir = resolve_cwd(cwd);
    let mut cmd = CommandBuilder::new(&shell);
    cmd.cwd(&dir);
    cmd.env("TERM", "xterm-256color");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| {
            let msg = format!("No se pudo iniciar `{shell}`: {e}");
            logging::append(&app, "error", "pty", &format!("{id}: {msg}"));
            msg
        })?;
    // The slave handle must be dropped or the reader never sees EOF on Windows.
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("No se pudo leer de la terminal: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("No se pudo escribir en la terminal: {e}"))?;

    state.sessions.lock().unwrap().insert(
        id.clone(),
        PtySession {
            master: pair.master,
            writer,
            child,
        },
    );

    logging::append(
        &app,
        "info",
        "pty",
        &format!("terminal {id} inicia: {shell} en {}", dir.to_string_lossy()),
    );

    let sessions = state.sessions.clone();
    let reader_app = app.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = reader_app.emit(
                        "pty-output",
                        PtyOutputEvent {
                            id: id.clone(),
                            data,
                        },
                    );
                }
            }
        }

        // The pipe closed: reap the child (if it is still ours) and announce the exit.
        let session = sessions.lock().unwrap().remove(&id);
        let code = session.and_then(|mut s| s.child.wait().ok()).map(|st| {
            let raw = st.exit_code();
            if raw > i32::MAX as u32 {
                -1
            } else {
                raw as i32
            }
        });
        logging::append(
            &reader_app,
            "info",
            "pty",
            &format!("terminal {id} termina: código {code:?}"),
        );
        let _ = reader_app.emit("pty-exit", PtyExitEvent { id, code });
    });

    Ok(())
}

#[tauri::command]
pub fn pty_write(state: State<'_, PtyState>, id: String, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| format!("La terminal {id} ya no está abierta"))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("No se pudo escribir en la terminal: {e}"))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("No se pudo escribir en la terminal: {e}"))
}

#[tauri::command]
pub fn pty_resize(
    state: State<'_, PtyState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = match sessions.get(&id) {
        Some(s) => s,
        // Resizing a terminal that already exited is not an error worth surfacing.
        None => return Ok(()),
    };
    session
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("No se pudo redimensionar la terminal: {e}"))
}

#[tauri::command]
pub fn pty_kill(app: AppHandle, state: State<'_, PtyState>, id: String) -> Result<(), String> {
    let session = state.sessions.lock().unwrap().remove(&id);
    if let Some(mut s) = session {
        let _ = s.child.kill();
        let _ = s.child.wait();
        logging::append(&app, "info", "pty", &format!("terminal {id} cerrada"));
    }
    Ok(())
}

/// Kills every live session. Called when the app is quitting so no shell is left behind.
pub fn shutdown(app: &AppHandle) {
    if let Some(state) = app.try_state::<PtyState>() {
        let sessions: Vec<PtySession> = {
            let mut guard = state.sessions.lock().unwrap();
            guard.drain().map(|(_, s)| s).collect()
        };
        for mut s in sessions {
            let _ = s.child.kill();
            let _ = s.child.wait();
        }
    }
}

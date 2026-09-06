//! Read-only probes the "Diagnóstico" section (and `ais doctor`) needs and the rest of the
//! backend does not already expose: how big a folder of the app's own storage is and whether it
//! can be written, plus whether a TCP port is free.
//!
//! Nothing here fixes anything: it measures. The only write is a probe file that is removed
//! immediately, and folders are never created.

use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Deep enough for `history/` and `tasks/`, shallow enough that a symlink loop cannot hang the app.
const MAX_DEPTH: u32 = 4;
const PROBE_FILE: &str = ".ainess-write-check";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStat {
    path: String,
    exists: bool,
    writable: bool,
    files: u64,
    bytes: u64,
}

fn walk(dir: &Path, depth: u32, files: &mut u64, bytes: &mut u64) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            if depth < MAX_DEPTH {
                walk(&entry.path(), depth + 1, files, bytes);
            }
        } else if meta.is_file() {
            *files += 1;
            *bytes += meta.len();
        }
    }
}

/// Writes a probe file and deletes it again. The folder is never created.
fn is_writable(dir: &Path) -> bool {
    let probe = dir.join(PROBE_FILE);
    match fs::write(&probe, b"") {
        Ok(()) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

fn base_dir(app: &AppHandle, scope: &str) -> Result<PathBuf, String> {
    match scope {
        "logs" => crate::logging::logs_path(app),
        "config" => app.path().app_config_dir().map_err(|e| e.to_string()),
        other => Err(format!("Ámbito desconocido: {other}")),
    }
}

/// Size, file count and writability of `<logs|config>/<relative_path>`.
#[tauri::command]
pub fn storage_stat(
    app: AppHandle,
    scope: String,
    relative_path: Option<String>,
) -> Result<StorageStat, String> {
    let relative = relative_path.unwrap_or_default();
    if relative.contains("..") {
        return Err("Invalid path".into());
    }
    let mut path = base_dir(&app, &scope)?;
    if !relative.is_empty() {
        path.push(&relative);
    }

    if !path.is_dir() {
        return Ok(StorageStat {
            path: path.to_string_lossy().to_string(),
            exists: false,
            writable: false,
            files: 0,
            bytes: 0,
        });
    }

    let mut files = 0;
    let mut bytes = 0;
    walk(&path, 0, &mut files, &mut bytes);

    Ok(StorageStat {
        writable: is_writable(&path),
        path: path.to_string_lossy().to_string(),
        exists: true,
        files,
        bytes,
    })
}

/// True when nothing is listening on `port`, so the remote server could take it.
#[tauri::command]
pub fn port_available(port: u16) -> bool {
    TcpListener::bind(("0.0.0.0", port)).is_ok()
}

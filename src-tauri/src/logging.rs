//! File logging for both the Rust backend and the webview.
//!
//! Every line lands in `<app_log_dir>/ainess-YYYY-MM-DD.log` (on Windows
//! `%LOCALAPPDATA%\com.ainess\logs`) with the shape
//! `2026-09-05T14:03:22.123Z [info] [runner] message`.
//! The file rotates by date and files older than `KEEP_DAYS` are deleted at startup.
//! Writes never panic and never propagate an error: logging must not break the app.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

const KEEP_DAYS: i64 = 14;
const MAX_MESSAGE_LEN: usize = 10 * 1024;

/// Open log file, kept together with the date it belongs to so rotation is a cheap check.
#[derive(Default)]
pub struct LogState {
    file: Mutex<Option<(String, File)>>,
}

pub fn logs_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_log_dir().map_err(|e| e.to_string())
}

/// Writes one line to today's log file. Silently gives up on any I/O problem.
pub fn append(app: &AppHandle, level: &str, source: &str, message: &str) {
    let Some(state) = app.try_state::<LogState>() else { return };
    write_line(app, &state, level, source, message);
}

fn write_line(app: &AppHandle, state: &State<'_, LogState>, level: &str, source: &str, message: &str) {
    let (date, stamp) = now_strings();
    let masked = mask_secrets(message);
    let trimmed = truncate(&masked, MAX_MESSAGE_LEN);
    let line = format!(
        "{stamp} [{level}] [{source}] {}\n",
        trimmed.replace('\r', "").replace('\n', "\\n")
    );

    let Ok(mut guard) = state.file.lock() else { return };
    let needs_open = match guard.as_ref() {
        Some((d, _)) => d != &date,
        None => true,
    };
    if needs_open {
        let Ok(dir) = logs_path(app) else { return };
        if fs::create_dir_all(&dir).is_err() {
            return;
        }
        let path = dir.join(format!("ainess-{date}.log"));
        match OpenOptions::new().create(true).append(true).open(&path) {
            Ok(f) => *guard = Some((date.clone(), f)),
            Err(_) => return,
        }
    }
    if let Some((_, f)) = guard.as_mut() {
        let _ = f.write_all(line.as_bytes());
        let _ = f.flush();
    }
}

/// Deletes `ainess-*.log` files older than `KEEP_DAYS`. Best effort.
pub fn prune_old(app: &AppHandle) {
    let Ok(dir) = logs_path(app) else { return };
    let today = days_from_civil_now();
    let Ok(entries) = fs::read_dir(&dir) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(rest) = name.strip_prefix("ainess-") else { continue };
        let Some(date) = rest.strip_suffix(".log") else { continue };
        let Some(day) = parse_date(date) else { continue };
        if today - day > KEEP_DAYS {
            let _ = fs::remove_file(entry.path());
        }
    }
}

// ---- Tauri commands ------------------------------------------------------

#[tauri::command]
pub fn log_append(app: AppHandle, state: State<'_, LogState>, level: String, source: String, message: String) {
    write_line(&app, &state, &level, &source, &message);
}

#[tauri::command]
pub fn logs_dir(app: AppHandle) -> Result<String, String> {
    let dir = logs_path(&app)?;
    let _ = fs::create_dir_all(&dir);
    Ok(dir.to_string_lossy().to_string())
}

/// Opens the logs folder in the file manager. Done here (instead of from the front with the
/// opener plugin) so the plugin's scope does not need to be widened.
#[tauri::command]
pub async fn open_logs_dir(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_logs_dir_blocking(app))
        .await
        .map_err(|e| e.to_string())?
}

fn open_logs_dir_blocking(app: AppHandle) -> Result<(), String> {
    let dir = logs_path(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(dir.to_string_lossy().to_string(), None::<&str>).map_err(|e| e.to_string())
}

/// Last `limit` lines of today's log file (falls back to an empty list).
#[tauri::command]
pub async fn read_recent_logs(app: AppHandle, limit: usize) -> Vec<String> {
    tauri::async_runtime::spawn_blocking(move || read_recent_logs_blocking(app, limit))
        .await
        .unwrap_or_default()
}

fn read_recent_logs_blocking(app: AppHandle, limit: usize) -> Vec<String> {
    let Ok(dir) = logs_path(&app) else { return Vec::new() };
    let (date, _) = now_strings();
    let path = dir.join(format!("ainess-{date}.log"));
    let Ok(content) = fs::read_to_string(path) else { return Vec::new() };
    let lines: Vec<&str> = content.lines().collect();
    let start = lines.len().saturating_sub(limit);
    lines[start..].iter().map(|s| s.to_string()).collect()
}

// ---- Helpers -------------------------------------------------------------

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &s[..end])
}

/// Replaces the value of every `token=…` / `"token":"…"` / `Bearer …` with `***`,
/// so a URL or header never reaches the log file with a usable secret in it.
pub fn mask_secrets(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let lower = s.to_ascii_lowercase();
    let mut i = 0;
    while i < bytes.len() {
        let rest = &lower[i..];
        if let Some(marker) = ["token=", "\"token\":\"", "token\": \"", "bearer "]
            .iter()
            .find(|m| rest.starts_with(**m))
        {
            out.push_str(&s[i..i + marker.len()]);
            i += marker.len();
            while i < bytes.len() {
                let c = bytes[i] as char;
                if c == '&' || c == '"' || c == '\'' || c == ' ' || c == '\n' || c == '\r' || c == ',' || c == '}' {
                    break;
                }
                i += 1;
            }
            out.push_str("***");
            continue;
        }
        let ch_len = {
            let mut l = 1;
            while i + l < bytes.len() && !s.is_char_boundary(i + l) {
                l += 1;
            }
            l
        };
        out.push_str(&s[i..i + ch_len]);
        i += ch_len;
    }
    out
}

fn unix_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// `("2026-09-05", "2026-09-05T14:03:22.123Z")` in UTC, without pulling in `chrono`.
fn now_strings() -> (String, String) {
    let millis = unix_millis();
    let secs = millis.div_euclid(1000);
    let ms = millis.rem_euclid(1000);
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (y, m, d) = civil_from_days(days);
    let (h, mi, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let date = format!("{y:04}-{m:02}-{d:02}");
    let stamp = format!("{date}T{h:02}:{mi:02}:{s:02}.{ms:03}Z");
    (date, stamp)
}

fn days_from_civil_now() -> i64 {
    unix_millis().div_euclid(1000).div_euclid(86_400)
}

fn parse_date(s: &str) -> Option<i64> {
    let mut parts = s.split('-');
    let y: i64 = parts.next()?.parse().ok()?;
    let m: u32 = parts.next()?.parse().ok()?;
    let d: u32 = parts.next()?.parse().ok()?;
    if parts.next().is_some() || !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    Some(days_from_civil(y, m, d))
}

/// Howard Hinnant's civil calendar algorithms (days since the Unix epoch <-> Y/M/D).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as i64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if m > 2 { m - 3 } else { m + 9 } as i64;
    let doy = (153 * mp + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_tokens_in_urls() {
        assert_eq!(
            mask_secrets("http://1.2.3.4:4710/?token=abc-123&x=1"),
            "http://1.2.3.4:4710/?token=***&x=1"
        );
        assert_eq!(mask_secrets("Authorization: Bearer secreto"), "Authorization: Bearer ***");
        assert_eq!(mask_secrets("{\"token\":\"abc\"}"), "{\"token\":\"***\"}");
        assert_eq!(mask_secrets("sin secretos"), "sin secretos");
    }

    #[test]
    fn round_trips_dates() {
        for day in [0_i64, 1, 19_000, 20_337, -1] {
            let (y, m, d) = civil_from_days(day);
            assert_eq!(days_from_civil(y, m, d), day);
        }
    }
}

use std::fs;
use tauri::Manager;

#[tauri::command]
pub async fn load_config(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || load_config_blocking(app))
        .await
        .map_err(|e| e.to_string())?
}

fn load_config_blocking(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");

    if !config_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    let json = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    Ok(Some(json))
}

#[tauri::command]
pub async fn save_config(app: tauri::AppHandle, config: serde_json::Value) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || save_config_blocking(app, config))
        .await
        .map_err(|e| e.to_string())?
}

/// One writer of `config.json` at a time.
///
/// This used to come for free: a synchronous command runs on the main thread, so two saves could
/// not overlap. Now that the write happens on a thread pool they can, and the file this guards is
/// the one where half of it is worse than none of it.
static CONFIG_WRITE: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn save_config_blocking(app: tauri::AppHandle, config: serde_json::Value) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }

    let config_path = config_dir.join("config.json");
    let json_string = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;

    // A poisoned lock means some other save panicked mid-write. That is exactly when the next save
    // matters most, so we take the guard anyway rather than refusing to write.
    let _guard = CONFIG_WRITE.lock().unwrap_or_else(|e| e.into_inner());

    // Write beside it and rename over: a reader in another process (`ainess run`, `ainess serve`)
    // sees either the old file or the new one, never the half a truncating write leaves behind.
    let temp_path = config_dir.join("config.json.tmp");
    fs::write(&temp_path, json_string).map_err(|e| e.to_string())?;
    fs::rename(&temp_path, &config_path).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn write_config_file(app: tauri::AppHandle, relative_path: String, content: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || write_config_file_blocking(app, relative_path, content))
        .await
        .map_err(|e| e.to_string())?
}

fn write_config_file_blocking(app: tauri::AppHandle, relative_path: String, content: String) -> Result<String, String> {
    if relative_path.contains("..") {
        return Err("Invalid path".into());
    }

    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let path = config_dir.join(&relative_path);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&path, content).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

/// Removes one file of the config dir. Missing is not an error: the point is that it is gone.
///
/// Deleting a project used to leave its history and its board behind as empty files, one pair per
/// project ever deleted, which the diagnostics then counted as data.
#[tauri::command]
pub async fn delete_config_file(app: tauri::AppHandle, relative_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || delete_config_file_blocking(app, relative_path))
        .await
        .map_err(|e| e.to_string())?
}

fn delete_config_file_blocking(app: tauri::AppHandle, relative_path: String) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let path = config_dir.join(&relative_path);
    // Nothing outside the config dir, whatever the caller passed.
    if !path.starts_with(&config_dir) {
        return Err("Ruta fuera del directorio de configuración".into());
    }
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn read_config_file(app: tauri::AppHandle, relative_path: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || read_config_file_blocking(app, relative_path))
        .await
        .map_err(|e| e.to_string())?
}

fn read_config_file_blocking(app: tauri::AppHandle, relative_path: String) -> Result<Option<String>, String> {
    if relative_path.contains("..") {
        return Err("Invalid path".into());
    }

    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let path = config_dir.join(&relative_path);

    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(Some(content))
}

/// Reads a file relative to the user's home directory (read-only, rejects `..`).
#[tauri::command]
pub async fn read_home_file(relative_path: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || read_home_file_blocking(relative_path))
        .await
        .map_err(|e| e.to_string())?
}

fn read_home_file_blocking(relative_path: String) -> Result<Option<String>, String> {
    if relative_path.contains("..") {
        return Err("Invalid path".into());
    }

    let home_dir = dirs::home_dir().ok_or_else(|| "No se pudo determinar el directorio home".to_string())?;
    let path = home_dir.join(&relative_path);

    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(Some(content))
}

/// Writes a file anywhere, creating the folder it goes in. Used for the `.ainess/` folder the app
/// keeps inside each project, so the agents can read what the app knows.
#[tauri::command]
pub async fn write_file_abs(path: String, content: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || write_file_abs_blocking(path, content))
        .await
        .map_err(|e| e.to_string())?
}

fn write_file_abs_blocking(path: String, content: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&path);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Writes a file whose content is not text: what the user attaches in the composer (an image, a
/// PDF) arrives base64-encoded because that is what survives the trip through the webview.
#[tauri::command]
pub async fn write_file_bytes(path: String, data_b64: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || write_file_bytes_blocking(path, data_b64))
        .await
        .map_err(|e| e.to_string())?
}

fn write_file_bytes_blocking(path: String, data_b64: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_b64.as_bytes())
        .map_err(|e| e.to_string())?;
    let path = std::path::PathBuf::from(&path);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// Reads a file by absolute path (read-only). Returns `None` when it does not exist or cannot
/// be read, so callers only need to distinguish "not there" from "there".
#[tauri::command]
pub async fn read_file_abs(path: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || read_file_abs_blocking(path))
        .await
        .map_err(|e| e.to_string())?
}

fn read_file_abs_blocking(path: String) -> Result<Option<String>, String> {
    let path = std::path::Path::new(&path);
    if !path.exists() {
        return Ok(None);
    }

    match fs::read_to_string(path) {
        Ok(content) => Ok(Some(content)),
        Err(_) => Ok(None),
    }
}

/// Which of `paths` exist. Read-only, and it never reads a byte of them.
///
/// The caller wants to know which lockfile a project has, and a `pnpm-lock.yaml` can be several
/// megabytes: `read_file_abs` would answer the question by pulling all of it across the bridge and
/// throwing it away. Only files count, so a directory named `Makefile` is not a Makefile.
#[tauri::command]
pub async fn files_exist_abs(paths: Vec<String>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_iter()
            .filter(|p| std::path::Path::new(p).is_file())
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    /// The `.ainess/` folder of a project does not exist until the app writes into it.
    #[test]
    fn writes_a_file_into_a_folder_that_is_not_there_yet() {
        let dir = std::env::temp_dir().join(format!("ainess-write-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let file = dir.join(".ainess").join("BOARD.md");

        super::write_file_abs_blocking(file.to_string_lossy().into_owned(), "# Tablero
".into()).unwrap();

        assert_eq!(std::fs::read_to_string(&file).unwrap(), "# Tablero
");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// What the user attaches is not text: it comes base64-encoded and has to land byte for byte.
    #[test]
    fn writes_an_attachment_back_to_its_own_bytes() {
        let dir = std::env::temp_dir().join(format!("ainess-attach-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let file = dir.join(".ainess").join("attachments").join("captura.png");
        // The first bytes of a PNG, zero included: nothing here survives being treated as text.
        let bytes: Vec<u8> = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff];

        super::write_file_bytes_blocking(
            file.to_string_lossy().into_owned(),
            "iVBORw0KGgoA/w==".into(),
        )
        .unwrap();

        assert_eq!(std::fs::read(&file).unwrap(), bytes);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// A broken payload is an error, not a file full of rubbish.
    #[test]
    fn refuses_something_that_is_not_base64() {
        let file = std::env::temp_dir().join("ainess-attach-bad.bin");
        let _ = std::fs::remove_file(&file);
        assert!(super::write_file_bytes_blocking(file.to_string_lossy().into_owned(), "no es base64!!".into()).is_err());
        assert!(!file.exists());
    }
}

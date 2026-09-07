use std::fs;
use tauri::Manager;

#[tauri::command]
pub fn load_config(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
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
pub fn save_config(app: tauri::AppHandle, config: serde_json::Value) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }

    let config_path = config_dir.join("config.json");
    let json_string = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    
    fs::write(config_path, json_string).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn write_config_file(app: tauri::AppHandle, relative_path: String, content: String) -> Result<String, String> {
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
pub fn delete_config_file(app: tauri::AppHandle, relative_path: String) -> Result<(), String> {
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
pub fn read_config_file(app: tauri::AppHandle, relative_path: String) -> Result<Option<String>, String> {
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
pub fn read_home_file(relative_path: String) -> Result<Option<String>, String> {
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

/// Reads a file by absolute path (read-only). Returns `None` when it does not exist or cannot
/// be read, so callers only need to distinguish "not there" from "there".
/// Writes a file anywhere, creating the folder it goes in. Used for the `.ainess/` folder the app
/// keeps inside each project, so the agents can read what the app knows.
#[tauri::command]
pub fn write_file_abs(path: String, content: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&path);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_file_abs(path: String) -> Result<Option<String>, String> {
    let path = std::path::Path::new(&path);
    if !path.exists() {
        return Ok(None);
    }

    match fs::read_to_string(path) {
        Ok(content) => Ok(Some(content)),
        Err(_) => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    /// The `.ainess/` folder of a project does not exist until the app writes into it.
    #[test]
    fn writes_a_file_into_a_folder_that_is_not_there_yet() {
        let dir = std::env::temp_dir().join(format!("ainess-write-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let file = dir.join(".ainess").join("BOARD.md");

        super::write_file_abs(file.to_string_lossy().into_owned(), "# Tablero
".into()).unwrap();

        assert_eq!(std::fs::read_to_string(&file).unwrap(), "# Tablero
");
        let _ = std::fs::remove_dir_all(&dir);
    }
}

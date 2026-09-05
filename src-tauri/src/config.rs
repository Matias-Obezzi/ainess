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

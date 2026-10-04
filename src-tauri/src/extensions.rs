//! Desktop extensions (`.mcpb`, formerly `.dxt`): a zip with a `manifest.json` that says how to
//! start the MCP server inside it.
//!
//! Installing one is unpacking it into the app's own `extensions/` folder; what the server needs to
//! run (the command, the values the user fills in) is decided by the frontend from the manifest, the
//! same way it reads the extensions Claude Desktop installed. This side only puts files on disk and
//! takes them off again, and never outside that folder.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(serde::Serialize)]
pub struct InstalledExtension {
    /// Absolute folder the extension was unpacked into.
    pub dir: String,
    /// `manifest.json`, as the archive had it.
    pub manifest: String,
}

/// Where extensions live: `<app config>/extensions`.
fn extensions_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("extensions"))
}

/// A folder name out of the manifest's `name`: letters, digits, `-`, `_` and `.`, nothing else.
fn folder_name(name: &str) -> Option<String> {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '-' })
        .collect();
    let trimmed = cleaned.trim_matches(|c| c == '-' || c == '.').to_string();
    if trimmed.is_empty() { None } else { Some(trimmed) }
}

/// Unpacks `archive` into `<root>/<name from its manifest>`, replacing an earlier install of the same
/// extension. Every entry is checked to stay inside the target (`enclosed_name`): an archive whose
/// paths climb out with `..` is rejected rather than allowed to write anywhere else.
fn install_into(root: &Path, archive: &Path) -> Result<InstalledExtension, String> {
    let file = fs::File::open(archive).map_err(|e| format!("could not open the extension: {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("not a valid extension archive: {e}"))?;

    let mut manifest = String::new();
    zip.by_name("manifest.json")
        .map_err(|_| "the archive has no manifest.json at its root".to_string())?
        .read_to_string(&mut manifest)
        .map_err(|e| format!("could not read manifest.json: {e}"))?;
    let parsed: serde_json::Value = serde_json::from_str(&manifest).map_err(|e| format!("manifest.json is not valid JSON: {e}"))?;
    let name = parsed.get("name").and_then(|v| v.as_str()).and_then(folder_name)
        .ok_or_else(|| "manifest.json has no usable name".to_string())?;

    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let target = root.join(&name);
    let staging = root.join(format!("{name}.part"));
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(|e| e.to_string())?;

    let unpacked = (|| -> Result<(), String> {
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
            let relative = entry.enclosed_name().ok_or_else(|| format!("unsafe path in the archive: {}", entry.name()))?;
            let out_path = staging.join(relative);
            if entry.is_dir() {
                fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
                continue;
            }
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            out.flush().map_err(|e| e.to_string())?;
            #[cfg(unix)]
            if let Some(mode) = entry.unix_mode() {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&out_path, fs::Permissions::from_mode(mode));
            }
        }
        Ok(())
    })();
    if let Err(e) = unpacked {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }

    // Swapped in whole: an update half-unpacked over the previous version would run neither.
    let _ = fs::remove_dir_all(&target);
    fs::rename(&staging, &target).map_err(|e| e.to_string())?;
    Ok(InstalledExtension { dir: target.to_string_lossy().into_owned(), manifest })
}

/// Removes an installed extension's folder. Anything not directly inside `root` is refused: this
/// deletes a whole tree, and the path comes from the frontend.
fn remove_from(root: &Path, dir: &Path) -> Result<(), String> {
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let dir = match dir.canonicalize() {
        Ok(d) => d,
        Err(_) => return Ok(()), // already gone
    };
    if dir.parent() != Some(root.as_path()) {
        return Err("not an extension folder of this app".into());
    }
    fs::remove_dir_all(&dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_extension(app: tauri::AppHandle, archive_path: String) -> Result<InstalledExtension, String> {
    let root = extensions_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || install_into(&root, Path::new(&archive_path)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn remove_extension(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    let root = extensions_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || remove_from(&root, Path::new(&dir)))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ainess-ext-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn archive(at: &Path, files: &[(&str, &str)]) -> PathBuf {
        let path = at.join("ext.mcpb");
        let mut zip = zip::ZipWriter::new(fs::File::create(&path).unwrap());
        let opts: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for (name, content) in files {
            zip.start_file(*name, opts).unwrap();
            zip.write_all(content.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
        path
    }

    #[test]
    fn unpacks_under_the_manifest_name_and_replaces_an_earlier_install() {
        let work = temp("install");
        let root = work.join("extensions");
        let first = archive(&work, &[("manifest.json", r#"{"name":"my ext/../x","version":"1"}"#), ("server/index.js", "v1"), ("old.txt", "x")]);
        let installed = install_into(&root, &first).unwrap();
        let dir = PathBuf::from(&installed.dir);
        assert_eq!(dir.file_name().unwrap(), "my-ext-..-x");
        assert_eq!(fs::read_to_string(dir.join("server/index.js")).unwrap(), "v1");

        let second = archive(&work, &[("manifest.json", r#"{"name":"my ext/../x","version":"2"}"#), ("server/index.js", "v2")]);
        install_into(&root, &second).unwrap();
        assert_eq!(fs::read_to_string(dir.join("server/index.js")).unwrap(), "v2");
        assert!(!dir.join("old.txt").exists(), "the previous version is replaced, not merged into");
        let _ = fs::remove_dir_all(&work);
    }

    #[test]
    fn refuses_an_archive_without_a_manifest() {
        let work = temp("nomanifest");
        let a = archive(&work, &[("server/index.js", "x")]);
        assert!(install_into(&work.join("extensions"), &a).is_err());
        let _ = fs::remove_dir_all(&work);
    }

    #[test]
    fn removes_only_folders_directly_inside_its_own() {
        let work = temp("remove");
        let root = work.join("extensions");
        fs::create_dir_all(root.join("ok")).unwrap();
        fs::create_dir_all(work.join("elsewhere")).unwrap();
        assert!(remove_from(&root, &work.join("elsewhere")).is_err());
        assert!(work.join("elsewhere").exists());
        remove_from(&root, &root.join("ok")).unwrap();
        assert!(!root.join("ok").exists());
        assert!(remove_from(&root, &root.join("missing")).is_ok());
        let _ = fs::remove_dir_all(&work);
    }
}

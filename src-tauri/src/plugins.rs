//! Plugins fetched from a git repository (a Claude Code plugin, or a marketplace of them).
//!
//! A clone into `<app config>/plugins/<name>`, shallow and swapped in whole, and its removal —
//! nothing outside that folder. What a plugin holds (skills, MCP servers, commands) is read by the
//! frontend from the folder.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

fn plugins_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("plugins"))
}

/// A folder name from a repository URL or an `owner/repo`: its last part, without `.git`.
pub fn folder_from_repo(repo: &str) -> Option<String> {
    let last = repo.trim().trim_end_matches('/').rsplit(['/', ':']).next()?.trim_end_matches(".git");
    let clean: String = last.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '-' }).collect();
    let clean = clean.trim_matches(|c| c == '-' || c == '.').to_string();
    if clean.is_empty() { None } else { Some(clean) }
}

/// `owner/repo` is GitHub; a scheme or an `user@host:` is a git URL as given; `host.tld/owner/repo`
/// gets https in front.
pub fn clone_url(repo: &str) -> String {
    let r = repo.trim().trim_matches('/');
    if r.contains("://") || r.contains('@') {
        r.to_string()
    } else if r.split('/').next().is_some_and(|host| host.contains('.')) {
        format!("https://{r}")
    } else {
        format!("https://github.com/{r}.git")
    }
}

fn git() -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("git");
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        cmd
    }
    #[cfg(not(windows))]
    Command::new("git")
}

fn clone_into(root: &Path, repo: &str) -> Result<String, String> {
    let name = folder_from_repo(repo).ok_or("not a repository address")?;
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let target = root.join(&name);
    let staging = root.join(format!("{name}.part"));
    let _ = fs::remove_dir_all(&staging);
    let out = git()
        .args(["clone", "--depth", "1", "--quiet", &clone_url(repo)])
        .arg(&staging)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|e| format!("git did not start: {e}"))?;
    if !out.status.success() {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("git clone failed: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    let _ = fs::remove_dir_all(&target);
    fs::rename(&staging, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

fn remove_from(root: &Path, dir: &Path) -> Result<(), String> {
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let Ok(dir) = dir.canonicalize() else { return Ok(()) };
    if !dir.starts_with(&root) || dir == root {
        return Err("not a plugin folder of this app".into());
    }
    // A plugin inside a cloned marketplace goes with the whole clone, the folder right under root.
    let top = root.join(dir.strip_prefix(&root).map_err(|e| e.to_string())?.components().next().ok_or("empty path")?);
    fs::remove_dir_all(&top).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clone_plugin_repo(app: tauri::AppHandle, repo: String) -> Result<String, String> {
    let root = plugins_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || clone_into(&root, &repo)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn remove_plugin_dir(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    let root = plugins_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || remove_from(&root, Path::new(&dir))).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_and_urls() {
        assert_eq!(folder_from_repo("DietrichGebert/ponytail").as_deref(), Some("ponytail"));
        assert_eq!(folder_from_repo("https://github.com/anthropics/claude-plugins.git").as_deref(), Some("claude-plugins"));
        assert_eq!(folder_from_repo("git@github.com:org/repo.git").as_deref(), Some("repo"));
        assert_eq!(clone_url("DietrichGebert/ponytail"), "https://github.com/DietrichGebert/ponytail.git");
        assert_eq!(clone_url("https://gitlab.com/a/b.git"), "https://gitlab.com/a/b.git");
        assert_eq!(clone_url("git@github.com:org/repo.git"), "git@github.com:org/repo.git");
    }

    #[test]
    fn removes_only_inside_its_folder_and_takes_the_whole_clone() {
        let w = std::env::temp_dir().join(format!("ainess-plugins-{}", std::process::id()));
        let _ = fs::remove_dir_all(&w);
        let root = w.join("plugins");
        fs::create_dir_all(root.join("market/plugins/one")).unwrap();
        fs::create_dir_all(w.join("elsewhere")).unwrap();
        assert!(remove_from(&root, &w.join("elsewhere")).is_err());
        assert!(remove_from(&root, &root).is_err());
        remove_from(&root, &root.join("market/plugins/one")).unwrap();
        assert!(!root.join("market").exists());
        let _ = fs::remove_dir_all(&w);
    }
}


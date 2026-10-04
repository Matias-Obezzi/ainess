//! Skill folders on disk: a `SKILL.md` and whatever sits beside it (scripts, references).
//!
//! The frontend decides which skills go where; this side lists folders, copies one skill folder
//! whole, removes one — and only something that is a skill folder — and unpacks an uploaded zip.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    /// A folder, or a link to one.
    pub is_dir: bool,
}

/// The entries of a folder, links followed for telling folders apart. None when it is not there.
fn list(path: &Path) -> Option<Vec<DirEntry>> {
    let mut out = vec![];
    for entry in fs::read_dir(path).ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = fs::metadata(entry.path()).map(|m| m.is_dir()).unwrap_or(false);
        out.push(DirEntry { name, is_dir });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Some(out)
}

fn copy_tree(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        // Followed, not copied as links: a linked skill (the `skills` tool links them into
        // ~/.claude/skills) is copied as the folder it points to.
        if fs::metadata(&from)?.is_dir() {
            copy_tree(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// `dst` replaced by a copy of `src`, swapped in whole.
fn copy_dir_into(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.join("SKILL.md").is_file() {
        return Err("not a skill folder (no SKILL.md)".into());
    }
    let parent = dst.parent().ok_or("no parent folder")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let staging = PathBuf::from(format!("{}.part", dst.to_string_lossy()));
    let _ = fs::remove_dir_all(&staging);
    if let Err(e) = copy_tree(src, &staging) {
        let _ = fs::remove_dir_all(&staging);
        return Err(e.to_string());
    }
    remove_any(dst);
    fs::rename(&staging, dst).map_err(|e| e.to_string())
}

/// A folder, or a link to one, gone; a link only loses itself, never what it points to.
fn remove_any(path: &Path) {
    match fs::symlink_metadata(path) {
        Ok(m) if m.file_type().is_symlink() => {
            let _ = fs::remove_dir(path).or_else(|_| fs::remove_file(path));
        }
        Ok(_) => { let _ = fs::remove_dir_all(path); }
        Err(_) => {}
    }
}

/// Removes a skill folder: only one that sits in a folder called `skills` and holds a SKILL.md.
fn remove_skill(path: &Path) -> Result<(), String> {
    if fs::symlink_metadata(path).is_err() {
        return Ok(());
    }
    let in_skills = path.parent().and_then(|p| p.file_name()).map(|n| n == "skills").unwrap_or(false);
    if !in_skills || !path.join("SKILL.md").is_file() {
        return Err("not a skill folder".into());
    }
    remove_any(path);
    Ok(())
}

/// Unpacks an uploaded skill zip into `<root>/<name>`: its SKILL.md may be at the root of the
/// archive or inside one folder, which is then the skill. Entries are kept inside the target.
fn unpack_into(root: &Path, archive: &Path, name: &str) -> Result<String, String> {
    let file = fs::File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("not a valid zip: {e}"))?;
    let prefix = (0..zip.len())
        .filter_map(|i| zip.by_index(i).ok().and_then(|e| e.enclosed_name()))
        .filter(|p| p.file_name().map(|n| n == "SKILL.md").unwrap_or(false))
        .min_by_key(|p| p.components().count())
        .map(|p| p.parent().map(Path::to_path_buf).unwrap_or_default())
        .ok_or("the zip has no SKILL.md")?;
    let target = root.join(name);
    let staging = root.join(format!("{name}.part"));
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(path) = entry.enclosed_name() else { continue };
        let Ok(relative) = path.strip_prefix(&prefix) else { continue };
        if relative.as_os_str().is_empty() { continue; }
        let out = staging.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
        let mut buf = vec![];
        entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        fs::File::create(&out).and_then(|mut f| f.write_all(&buf)).map_err(|e| e.to_string())?;
    }
    remove_any(&target);
    fs::rename(&staging, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

/// A folder name from what the user calls the skill.
fn folder_name(name: &str) -> String {
    let s: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c.to_ascii_lowercase() } else { '-' }).collect();
    let s = s.trim_matches('-').to_string();
    if s.is_empty() { "skill".into() } else { s }
}

#[tauri::command]
pub async fn list_dir(path: String) -> Option<Vec<DirEntry>> {
    tauri::async_runtime::spawn_blocking(move || list(Path::new(&path))).await.ok().flatten()
}

#[tauri::command]
pub async fn copy_skill_dir(src: String, dst: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || copy_dir_into(Path::new(&src), Path::new(&dst)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn remove_skill_dir(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || remove_skill(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

/// Unpacks an uploaded skill into `<app config>/skills/<name>`.
#[tauri::command]
pub async fn unpack_skill(app: tauri::AppHandle, archive_path: String, name: String) -> Result<String, String> {
    let root = app.path().app_config_dir().map_err(|e| e.to_string())?.join("skills");
    let folder = folder_name(&name);
    tauri::async_runtime::spawn_blocking(move || unpack_into(&root, Path::new(&archive_path), &folder))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("ainess-skills-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn skill(at: &Path) {
        fs::create_dir_all(at.join("scripts")).unwrap();
        fs::write(at.join("SKILL.md"), "---\nname: x\n---\nbody").unwrap();
        fs::write(at.join("scripts/run.py"), "print(1)").unwrap();
    }

    #[test]
    fn copies_a_skill_folder_whole_and_replaces_the_old_copy() {
        let w = temp("copy");
        skill(&w.join("src/x"));
        let dst = w.join("dst/skills/x");
        fs::create_dir_all(&dst).unwrap();
        fs::write(dst.join("stale.txt"), "old").unwrap();
        copy_dir_into(&w.join("src/x"), &dst).unwrap();
        assert_eq!(fs::read_to_string(dst.join("scripts/run.py")).unwrap(), "print(1)");
        assert!(!dst.join("stale.txt").exists());
        assert!(copy_dir_into(&w.join("src"), &w.join("dst/skills/y")).is_err(), "only a folder with a SKILL.md");
        let _ = fs::remove_dir_all(&w);
    }

    #[test]
    fn removes_only_skill_folders() {
        let w = temp("remove");
        skill(&w.join("skills/x"));
        fs::create_dir_all(w.join("other/y")).unwrap();
        fs::write(w.join("other/y/SKILL.md"), "x").unwrap();
        fs::create_dir_all(w.join("skills/not-a-skill")).unwrap();
        assert!(remove_skill(&w.join("other/y")).is_err());
        assert!(remove_skill(&w.join("skills/not-a-skill")).is_err());
        remove_skill(&w.join("skills/x")).unwrap();
        assert!(!w.join("skills/x").exists());
        assert!(remove_skill(&w.join("skills/gone")).is_ok());
        let _ = fs::remove_dir_all(&w);
    }

    #[test]
    fn lists_folders_and_files() {
        let w = temp("list");
        skill(&w.join("a"));
        fs::write(w.join("b.txt"), "").unwrap();
        let entries = list(&w).unwrap();
        assert_eq!(entries.iter().map(|e| (e.name.as_str(), e.is_dir)).collect::<Vec<_>>(), vec![("a", true), ("b.txt", false)]);
        assert!(list(&w.join("missing")).is_none());
        let _ = fs::remove_dir_all(&w);
    }

    #[test]
    fn unpacks_a_zip_whose_skill_is_inside_a_folder() {
        let w = temp("unzip");
        let archive = w.join("s.zip");
        {
            let mut zip = zip::ZipWriter::new(fs::File::create(&archive).unwrap());
            let opts: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default();
            zip.start_file("my-skill/SKILL.md", opts).unwrap();
            zip.write_all(b"---\nname: my skill\n---\n").unwrap();
            zip.start_file("my-skill/ref/a.md", opts).unwrap();
            zip.write_all(b"ref").unwrap();
            zip.finish().unwrap();
        }
        let dir = unpack_into(&w.join("skills"), &archive, &folder_name("My Skill!")).unwrap();
        assert!(dir.ends_with("my-skill"));
        assert!(Path::new(&dir).join("SKILL.md").is_file());
        assert_eq!(fs::read_to_string(Path::new(&dir).join("ref/a.md")).unwrap(), "ref");
        let _ = fs::remove_dir_all(&w);
    }
}

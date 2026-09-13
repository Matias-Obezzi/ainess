//! The editors installed on this machine, and opening a folder in one of them.
//!
//! Detection is a list of places to look, not a registry walk: the launcher each editor puts on
//! PATH, and the folder each one installs into by default. The exe is preferred over the `.cmd`
//! launcher where both exist (`code.cmd` starts node, which starts the exe — a console flashes).
//! Opening resolves the editor again from its id, so the webview never hands this side a path to
//! run: what runs is one of the programs found here, and the folder is its one argument.

use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EditorInfo {
    pub id: String,
    /// The product's own name — a proper noun, the same in every language.
    pub label: String,
    pub path: String,
}

/// Where each editor may be: the launcher name for `which`, and install folders relative to
/// `%LOCALAPPDATA%\Programs` and `%ProgramFiles%`.
struct Candidate {
    id: &'static str,
    label: &'static str,
    launchers: &'static [&'static str],
    local_programs: &'static [&'static str],
    program_files: &'static [&'static str],
}

const CANDIDATES: &[Candidate] = &[
    Candidate { id: "vscode", label: "Visual Studio Code", launchers: &["code"], local_programs: &["Microsoft VS Code/Code.exe"], program_files: &["Microsoft VS Code/Code.exe"] },
    Candidate { id: "vscode-insiders", label: "VS Code Insiders", launchers: &["code-insiders"], local_programs: &["Microsoft VS Code Insiders/Code - Insiders.exe"], program_files: &[] },
    Candidate { id: "cursor", label: "Cursor", launchers: &["cursor"], local_programs: &["cursor/Cursor.exe"], program_files: &[] },
    Candidate { id: "windsurf", label: "Windsurf", launchers: &["windsurf"], local_programs: &["Windsurf/Windsurf.exe"], program_files: &[] },
    Candidate { id: "zed", label: "Zed", launchers: &["zed"], local_programs: &["Zed/Zed.exe"], program_files: &[] },
    Candidate { id: "sublime", label: "Sublime Text", launchers: &["subl"], local_programs: &[], program_files: &["Sublime Text/subl.exe", "Sublime Text 3/subl.exe"] },
    Candidate { id: "idea", label: "IntelliJ IDEA", launchers: &["idea"], local_programs: &[], program_files: &[] },
    Candidate { id: "webstorm", label: "WebStorm", launchers: &["webstorm"], local_programs: &[], program_files: &[] },
    Candidate { id: "rider", label: "Rider", launchers: &["rider"], local_programs: &[], program_files: &[] },
    Candidate { id: "pycharm", label: "PyCharm", launchers: &["pycharm"], local_programs: &[], program_files: &[] },
    Candidate { id: "goland", label: "GoLand", launchers: &["goland"], local_programs: &[], program_files: &[] },
];

fn is_program(path: &PathBuf) -> bool {
    path.is_file()
}

fn find_candidate(c: &Candidate) -> Option<PathBuf> {
    // Install folders first: the exe itself, not a launcher script in front of it.
    if let Some(local) = dirs::data_local_dir() {
        for rel in c.local_programs {
            let p = local.join("Programs").join(rel);
            if is_program(&p) {
                return Some(p);
            }
        }
        // JetBrains Toolbox writes one launcher script per IDE here, and not always onto PATH.
        for name in c.launchers {
            let p = local.join("JetBrains").join("Toolbox").join("scripts").join(format!("{name}.cmd"));
            if is_program(&p) {
                return Some(p);
            }
        }
    }
    for root in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
        if let Ok(base) = std::env::var(root) {
            for rel in c.program_files {
                let p = PathBuf::from(&base).join(rel);
                if is_program(&p) {
                    return Some(p);
                }
            }
        }
    }
    for name in c.launchers {
        if let Ok(p) = which::which(name) {
            return Some(p);
        }
    }
    None
}

/// Visual Studio proper: `vswhere` knows where the newest one is.
fn find_visual_studio() -> Option<PathBuf> {
    let base = std::env::var("ProgramFiles(x86)").ok()?;
    let vswhere = PathBuf::from(base).join("Microsoft Visual Studio").join("Installer").join("vswhere.exe");
    if !vswhere.is_file() {
        return None;
    }
    let mut cmd = Command::new(vswhere);
    cmd.args(["-latest", "-products", "*", "-property", "productPath"]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().ok()?;
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path.is_empty() {
        return None;
    }
    let p = PathBuf::from(path);
    if p.is_file() { Some(p) } else { None }
}

fn detect_sync() -> Vec<EditorInfo> {
    let mut found = Vec::new();
    for c in CANDIDATES {
        if let Some(path) = find_candidate(c) {
            found.push(EditorInfo { id: c.id.to_string(), label: c.label.to_string(), path: path.to_string_lossy().into_owned() });
        }
    }
    if let Some(path) = find_visual_studio() {
        found.push(EditorInfo { id: "visualstudio".to_string(), label: "Visual Studio".to_string(), path: path.to_string_lossy().into_owned() });
    }
    found
}

/// The editors found on this machine. Off the main thread: `which` and `vswhere` touch the disk.
#[tauri::command]
pub async fn detect_editors() -> Vec<EditorInfo> {
    tauri::async_runtime::spawn_blocking(detect_sync).await.unwrap_or_default()
}

/// Opens `path` in the editor with that id. The program comes from detection, never from the
/// caller; the folder is one argument, never part of a command line.
#[tauri::command]
pub async fn open_in_editor(id: String, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let editor = detect_sync().into_iter().find(|e| e.id == id).ok_or_else(|| format!("editor not found: {id}"))?;
        let mut cmd = Command::new(&editor.path);
        cmd.arg(&path);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // No console for a `.cmd` launcher; a GUI exe is unaffected.
            cmd.creation_flags(0x0800_0000);
        }
        cmd.spawn().map(|_| ()).map_err(|e| format!("could not start {}: {e}", editor.label))
    })
    .await
    .map_err(|e| e.to_string())?
}

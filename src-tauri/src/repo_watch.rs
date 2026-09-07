//! Watches a project's repository and tells the webview when it changed.
//!
//! Before this the app re-read every repo on a timer, so the branch, the diff and the file count in
//! the sidebar were up to a minute behind whatever the user (or an agent) had just done. The kernel
//! already knows the moment a file moves; this turns that into one `repo-changed` event per project.
//!
//! Two things keep the noise down: paths that churn without changing what git reports are dropped
//! (`.git/objects`, `node_modules`, build output), and whatever survives is coalesced into a single
//! event per quiet period — a `git checkout` or an `npm install` touches thousands of files and the
//! webview only hears about it once.
use notify::{Event, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State as TauriState};

/// How long the repo has to sit still before the change is announced.
const QUIET: Duration = Duration::from_millis(400);
/// Even under a constant stream of writes (a build, a big checkout), say something this often.
const MAX_WAIT: Duration = Duration::from_secs(3);

#[derive(Default)]
pub struct RepoWatchState {
    /// One watcher per project id; dropping it stops the thread that goes with it.
    watchers: Mutex<HashMap<String, notify::RecommendedWatcher>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RepoChanged {
    project_id: String,
}

/// Paths whose churn never changes what `git status` says.
///
/// Read by path segment and not by substring: the events that arrive are not only the files, they
/// are also the folders holding them (`…/node_modules`, with nothing after it), and a rule written
/// as "contains /node_modules/" lets every one of those through. Only names that are never part of
/// a diff are listed — a build folder someone actually tracks keeps its events.
fn is_noise(path: &Path) -> bool {
    let segments: Vec<String> = path
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    for (i, segment) in segments.iter().enumerate() {
        let parent = if i > 0 { segments[i - 1].as_str() } else { "" };
        let noise = match segment.as_str() {
            "node_modules" | ".next" | ".venv" | "__pycache__" => true,
            // git writes most of a commit here, and none of it shows up in `git status`.
            "objects" | "lfs" => parent == ".git",
            "debug" | "release" => parent == "target",
            // The message buffer of a commit in progress.
            "commit_editmsg" => parent == ".git",
            _ => false,
        };
        if noise {
            return true;
        }
    }
    false
}

fn interesting(event: &Event) -> bool {
    event.paths.iter().any(|p| !is_noise(p))
}

/// Watches `root` and calls `on_change` once per burst of writes that git would care about.
///
/// The returned watcher owns the sender: dropping it ends the thread this spawns.
fn spawn_watcher(root: &Path, on_change: impl Fn() + Send + 'static) -> notify::Result<notify::RecommendedWatcher> {
    let (tx, rx) = mpsc::channel::<Event>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            let _ = tx.send(event);
        }
    })?;
    watcher.watch(root, RecursiveMode::Recursive)?;

    thread::spawn(move || {
        while let Ok(first) = rx.recv() {
            let mut pending = interesting(&first);
            let deadline = Instant::now() + MAX_WAIT;
            // Drain what follows: a checkout arrives as thousands of events and is one change.
            loop {
                match rx.recv_timeout(QUIET) {
                    Ok(event) => {
                        pending |= interesting(&event);
                        if Instant::now() >= deadline {
                            break;
                        }
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => break,
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }
            if pending {
                on_change();
            }
        }
    });

    Ok(watcher)
}

/// Starts watching one project's folder. Watching the same project again replaces the old watcher,
/// so a project whose path changed is never left with two.
#[tauri::command]
pub fn repo_watch_start(
    app: AppHandle,
    state: TauriState<'_, RepoWatchState>,
    project_id: String,
    path: String,
) -> Result<(), String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err(format!("No existe la carpeta {path}"));
    }
    // Not a repository: nothing to report, and no reason to hold a watcher on it.
    if !root.join(".git").exists() {
        stop(&state, &project_id);
        return Ok(());
    }

    let id = project_id.clone();
    let watcher = spawn_watcher(root, move || {
        let _ = app.emit("repo-changed", RepoChanged { project_id: id.clone() });
    })
    .map_err(|e| e.to_string())?;

    state.watchers.lock().unwrap().insert(project_id, watcher);
    Ok(())
}

#[tauri::command]
pub fn repo_watch_stop(state: TauriState<'_, RepoWatchState>, project_id: String) {
    stop(&state, &project_id);
}

fn stop(state: &TauriState<'_, RepoWatchState>, project_id: &str) {
    if let Ok(mut watchers) = state.watchers.lock() {
        watchers.remove(project_id);
    }
}

/// Drops every watcher when the app closes.
pub fn shutdown(app: &AppHandle) {
    use tauri::Manager;
    if let Some(state) = app.try_state::<RepoWatchState>() {
        if let Ok(mut watchers) = state.watchers.lock() {
            watchers.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{is_noise, spawn_watcher};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn drops_what_churns_without_changing_git() {
        for path in [
            "C:/dev/app/.git/objects/ab/cdef",
            "C:/dev/app/node_modules/react/index.js",
            // The folder itself arrives as an event, with nothing after its name.
            "C:/dev/app/node_modules",
            "C:/dev/app/src-tauri/target/debug/build/x.rs",
            "C:/dev/app/.next/cache/webpack/a.pack",
            "C:/dev/app/.git/COMMIT_EDITMSG",
        ] {
            assert!(is_noise(Path::new(path)), "{path}");
        }
    }

    #[test]
    fn keeps_what_changes_the_diff() {
        for path in [
            "C:/dev/app/src/main.ts",
            "C:/dev/app/.git/HEAD",
            "C:/dev/app/.git/index",
            "C:/dev/app/.git/refs/heads/main",
            // Nothing to do with node_modules: only whole segments count.
            "C:/dev/app/src/node_modules_helper.ts",
            // A build folder someone tracks on purpose still counts.
            "C:/dev/app/dist/index.html",
        ] {
            assert!(!is_noise(Path::new(path)), "{path}");
        }
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ainess-watch-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join(".git")).unwrap();
        fs::create_dir_all(dir.join("node_modules")).unwrap();
        dir
    }

    /// A save is one change, and so is a hundred of them in a row.
    #[test]
    fn a_burst_of_writes_is_announced_once() {
        let dir = temp_dir("burst");
        let (tx, rx) = mpsc::channel::<()>();
        let _watcher = spawn_watcher(&dir, move || { let _ = tx.send(()); }).unwrap();

        for i in 0..25 {
            fs::write(dir.join(format!("file-{i}.txt")), "hola").unwrap();
        }

        rx.recv_timeout(Duration::from_secs(5)).expect("no llegó el aviso");
        // Nothing else follows: the whole burst was one announcement.
        assert!(rx.recv_timeout(Duration::from_millis(1200)).is_err(), "avisó de más");
        let _ = fs::remove_dir_all(&dir);
    }

    /// Writes git could not care about never wake the app up.
    #[test]
    fn noise_alone_says_nothing() {
        let dir = temp_dir("noise");
        let (tx, rx) = mpsc::channel::<()>();
        let _watcher = spawn_watcher(&dir, move || { let _ = tx.send(()); }).unwrap();

        for i in 0..10 {
            fs::write(dir.join("node_modules").join(format!("dep-{i}.js")), "x").unwrap();
        }

        assert!(rx.recv_timeout(Duration::from_millis(1500)).is_err(), "avisó por ruido");
        let _ = fs::remove_dir_all(&dir);
    }
}

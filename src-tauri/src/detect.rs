use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BinaryInfo {
    pub path: String,
    pub version: Option<String>,
}

/// Runs the detection off the main thread: `--version` probes can take up to 5 s each.
#[tauri::command]
pub async fn detect_binaries() -> HashMap<String, Option<BinaryInfo>> {
    tauri::async_runtime::spawn_blocking(detect_binaries_sync)
        .await
        .unwrap_or_default()
}

fn detect_binaries_sync() -> HashMap<String, Option<BinaryInfo>> {
    let mut results = HashMap::new();

    thread::scope(|s| {
        let claude_handle = s.spawn(|| detect_claude());
        let agy_handle = s.spawn(|| detect_antigravity());
        let copilot_handle = s.spawn(|| detect_generic("copilot"));
        let gemini_handle = s.spawn(|| detect_generic("gemini"));
        let codex_handle = s.spawn(|| detect_generic("codex"));
        let ollama_handle = s.spawn(|| detect_generic("ollama"));
        let aider_handle = s.spawn(|| detect_generic("aider"));
        let opencode_handle = s.spawn(|| detect_generic("opencode"));

        results.insert("claude".to_string(), claude_handle.join().unwrap());
        results.insert("antigravity".to_string(), agy_handle.join().unwrap());
        results.insert("copilot".to_string(), copilot_handle.join().unwrap());
        results.insert("gemini".to_string(), gemini_handle.join().unwrap());
        results.insert("codex".to_string(), codex_handle.join().unwrap());
        results.insert("ollama".to_string(), ollama_handle.join().unwrap());
        results.insert("aider".to_string(), aider_handle.join().unwrap());
        results.insert("opencode".to_string(), opencode_handle.join().unwrap());
    });

    results
}

fn detect_generic(name: &str) -> Option<BinaryInfo> {
    if let Ok(path) = which::which(name) {
        let path_str = path.to_string_lossy().into_owned();
        let version = get_version(&path_str);
        Some(BinaryInfo {
            path: path_str,
            version,
        })
    } else {
        None
    }
}

fn detect_claude() -> Option<BinaryInfo> {
    if let Ok(path) = which::which("claude") {
        let path_str = path.to_string_lossy().into_owned();
        return Some(BinaryInfo {
            version: get_version(&path_str),
            path: path_str,
        });
    }

    let mut best_path: Option<PathBuf> = None;
    let mut best_version = vec![0, 0, 0];

    // The desktop app keeps Claude Code under Roaming (and could move to Local): check
    // every plausible root, not only APPDATA, so an odd terminal environment still finds it.
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(d) = dirs::config_dir() { roots.push(d); }
    if let Ok(v) = std::env::var("APPDATA") { roots.push(PathBuf::from(v)); }
    if let Some(h) = dirs::home_dir() {
        roots.push(h.join("AppData").join("Roaming"));
        roots.push(h.join("AppData").join("Local"));
    }
    if let Some(d) = dirs::data_local_dir() { roots.push(d); }
    roots.dedup();
    for appdata_path in roots {
        let claude_code_dir = appdata_path.join("Claude").join("claude-code");
        if let Ok(entries) = std::fs::read_dir(&claude_code_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        let name = entry.file_name();
                        let name_str = name.to_string_lossy();
                        if let Some(parsed) = parse_semver(&name_str) {
                            let exe_path = entry.path().join("claude.exe");
                            if exe_path.exists() {
                                if parsed > best_version {
                                    best_version = parsed;
                                    best_path = Some(exe_path);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(path) = best_path {
        let path_str = path.to_string_lossy().into_owned();
        return Some(BinaryInfo {
            version: get_version(&path_str),
            path: path_str,
        });
    }

    let home = dirs::home_dir().or_else(|| std::env::var("USERPROFILE").ok().map(PathBuf::from));
    if let Some(home_path) = home {
        let local_bin = home_path.join(".local").join("bin").join("claude.exe");
        if local_bin.exists() {
            let path_str = local_bin.to_string_lossy().into_owned();
            return Some(BinaryInfo {
                version: get_version(&path_str),
                path: path_str,
            });
        }
    }

    None
}

fn detect_antigravity() -> Option<BinaryInfo> {
    if let Ok(path) = which::which("agy") {
        let path_str = path.to_string_lossy().into_owned();
        return Some(BinaryInfo {
            version: get_version(&path_str),
            path: path_str,
        });
    }

    let home = dirs::home_dir().or_else(|| std::env::var("USERPROFILE").ok().map(PathBuf::from));
    if let Some(home_path) = home {
        let agy_path = home_path.join(".gemini").join("bin").join("agy.exe");
        if agy_path.exists() {
            let path_str = agy_path.to_string_lossy().into_owned();
            return Some(BinaryInfo {
                version: get_version(&path_str),
                path: path_str,
            });
        }
    }

    None
}

fn parse_semver(s: &str) -> Option<Vec<u32>> {
    let parts: Vec<&str> = s.split('.').collect();
    let mut nums = Vec::new();
    for p in parts {
        let num_str: String = p.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(n) = num_str.parse::<u32>() {
            nums.push(n);
        } else {
            break;
        }
    }
    if nums.is_empty() {
        None
    } else {
        Some(nums)
    }
}

fn get_version(path: &str) -> Option<String> {
    let mut cmd = Command::new(path);
    cmd.arg("--version");
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let mut child = cmd.spawn().ok()?;

    let start = Instant::now();
    let timeout = Duration::from_secs(5);

    loop {
        if let Ok(Some(_status)) = child.try_wait() {
            break;
        }
        if start.elapsed() > timeout {
            let _ = child.kill();
            return None;
        }
        thread::sleep(Duration::from_millis(50));
    }

    let output = child.wait_with_output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let first_line = stdout.lines().next()?.trim();
    
    if first_line.is_empty() {
        None
    } else {
        Some(first_line.to_string())
    }
}

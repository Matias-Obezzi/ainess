//! Process runner: spawns AI CLIs, streams their stdout/stderr to the
//! frontend as Tauri events and allows killing them by run id.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct RunnerState {
    children: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnOptions {
    pub run_id: String,
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub stdin_text: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputEvent {
    pub run_id: String,
    pub stream: String,
    pub line: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExitEvent {
    pub run_id: String,
    pub code: Option<i32>,
    pub killed: bool,
}

fn build_command(opts: &SpawnOptions) -> Command {
    let mut cmd = Command::new(&opts.program);
    cmd.args(&opts.args)
        .stdin(if opts.stdin_text.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = &opts.cwd {
        if !cwd.is_empty() {
            cmd.current_dir(cwd);
        }
    }
    for (k, v) in &opts.env {
        cmd.env(k, v);
    }
    // Force non-interactive, colorless output where CLIs honor it.
    cmd.env("NO_COLOR", "1").env("FORCE_COLOR", "0").env("CI", "1");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn pump<R: std::io::Read + Send + 'static>(
    app: AppHandle,
    run_id: String,
    stream: &'static str,
    reader: R,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let buf = BufReader::new(reader);
        for line in buf.split(b'\n') {
            match line {
                Ok(bytes) => {
                    let mut text = String::from_utf8_lossy(&bytes).to_string();
                    if text.ends_with('\r') {
                        text.pop();
                    }
                    let _ = app.emit(
                        "run-output",
                        OutputEvent {
                            run_id: run_id.clone(),
                            stream: stream.to_string(),
                            line: text,
                        },
                    );
                }
                Err(_) => break,
            }
        }
    })
}

#[tauri::command]
pub fn spawn_run(
    app: AppHandle,
    state: State<'_, RunnerState>,
    opts: SpawnOptions,
) -> Result<(), String> {
    let mut cmd = build_command(&opts);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("No se pudo iniciar `{}`: {e}", opts.program))?;

    if let Some(text) = opts.stdin_text.clone() {
        if let Some(mut stdin) = child.stdin.take() {
            thread::spawn(move || {
                let _ = stdin.write_all(text.as_bytes());
                let _ = stdin.flush();
                // dropping stdin closes the pipe so the CLI sees EOF
            });
        }
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let run_id = opts.run_id.clone();
    let child = Arc::new(Mutex::new(child));
    state
        .children
        .lock()
        .unwrap()
        .insert(run_id.clone(), child.clone());

    let out_h = stdout.map(|s| pump(app.clone(), run_id.clone(), "stdout", s));
    let err_h = stderr.map(|s| pump(app.clone(), run_id.clone(), "stderr", s));

    let children = state.children.clone();
    thread::spawn(move || {
        if let Some(h) = out_h {
            let _ = h.join();
        }
        if let Some(h) = err_h {
            let _ = h.join();
        }
        // Pipes are closed; wait for the process to actually exit.
        let code = loop {
            let status = child.lock().unwrap().try_wait();
            match status {
                Ok(Some(st)) => break st.code(),
                Ok(None) => thread::sleep(Duration::from_millis(50)),
                Err(_) => break None,
            }
        };
        let killed = children.lock().unwrap().remove(&run_id).is_none();
        let _ = app.emit(
            "run-exit",
            ExitEvent {
                run_id,
                code,
                killed,
            },
        );
    });

    Ok(())
}

#[tauri::command]
pub fn kill_run(state: State<'_, RunnerState>, run_id: String) -> Result<bool, String> {
    let child = state.children.lock().unwrap().remove(&run_id);
    match child {
        Some(c) => {
            let mut c = c.lock().unwrap();
            #[cfg(windows)]
            {
                // Kill the whole tree: node-based CLIs spawn helpers.
                let pid = c.id();
                let _ = Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
            }
            c.kill().map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

#[tauri::command]
pub fn running_runs(state: State<'_, RunnerState>) -> Vec<String> {
    state.children.lock().unwrap().keys().cloned().collect()
}

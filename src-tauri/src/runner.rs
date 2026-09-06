//! Process runner: spawns AI CLIs, streams their stdout/stderr to the
//! frontend as Tauri events and allows killing them by run id.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Output, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

use crate::logging;

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
    let mut child = cmd.spawn().map_err(|e| {
        let msg = format!("No se pudo iniciar `{}`: {e}", opts.program);
        logging::append(&app, "error", "runner", &format!("run {}: {msg}", opts.run_id));
        msg
    })?;
    logging::append(
        &app,
        "info",
        "runner",
        &format!("run {} inicia: {} {}", opts.run_id, opts.program, opts.args.join(" ")),
    );

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
        logging::append(
            &app,
            "info",
            "runner",
            &format!("run {run_id} termina: código {code:?}{}", if killed { " (detenido)" } else { "" }),
        );
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

/// Kills every agent process still running (whole trees on Windows). Called when the app exits so
/// no implementer keeps editing a workspace with nobody watching.
pub fn shutdown(app: &tauri::AppHandle) {
    use tauri::Manager;
    let state = app.state::<RunnerState>();
    let children: Vec<(String, Arc<Mutex<Child>>)> = state.children.lock().unwrap().drain().collect();
    for (run_id, child) in children {
        let mut c = child.lock().unwrap();
        #[cfg(windows)]
        {
            let pid = c.id();
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
        let _ = c.kill();
        crate::logging::append(app, "warn", "runner", &format!("run {run_id} matado al cerrar la app"));
    }
}

#[tauri::command]
pub fn running_runs(state: State<'_, RunnerState>) -> Vec<String> {
    state.children.lock().unwrap().keys().cloned().collect()
}

/// Hard limit for `exec_capture`, matching the 60 s the Node transport passes to
/// `spawnSync` in src/lib/transport-node.ts.
const EXEC_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecResult {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

#[tauri::command]
pub fn exec_capture(
    app: AppHandle,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<ExecResult, String> {
    // Installers and updaters legitimately take longer than a version probe.
    let timeout = timeout_secs.map(Duration::from_secs).unwrap_or(EXEC_TIMEOUT);
    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    
    if let Some(c) = cwd {
        if !c.is_empty() {
            cmd.current_dir(c);
        }
    }
    
    // Use CREATE_NO_WINDOW on Windows to prevent flashing console windows
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    let child = cmd.spawn().map_err(|e| {
        let msg = format!("No se pudo ejecutar {}: {}", program, e);
        logging::append(&app, "error", "exec", &msg);
        msg
    })?;

    match wait_with_timeout(child, timeout) {
        Ok(output) => Ok(ExecResult {
            code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        }),
        Err(WaitError::Failed(e)) => {
            let msg = format!("Falló la ejecución de {}: {}", program, e);
            logging::append(&app, "error", "exec", &msg);
            Err(msg)
        }
        Err(WaitError::TimedOut) => {
            let msg = format!(
                "{} no respondió en {} s: se canceló la ejecución.",
                program,
                timeout.as_secs()
            );
            logging::append(&app, "error", "exec", &msg);
            Err(msg)
        }
    }
}

enum WaitError {
    /// Waiting itself failed (the OS could not report the exit status).
    Failed(std::io::Error),
    /// The program was still running after the timeout and got killed.
    TimedOut,
}

/// Waits for `child` and collects its output, giving up after `timeout` and killing the
/// process tree. `std` has no wait-with-timeout, so the wait runs on a helper thread and
/// the result comes back over a channel. `wait_with_output` drains both pipes while it
/// waits, so a chatty program cannot deadlock by filling a pipe buffer; when we time out
/// that thread stays around until the kill lands and its send fails harmlessly.
fn wait_with_timeout(child: Child, timeout: Duration) -> Result<Output, WaitError> {
    let pid = child.id();
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });

    match rx.recv_timeout(timeout) {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(e)) => Err(WaitError::Failed(e)),
        Err(_) => {
            kill_tree(pid);
            Err(WaitError::TimedOut)
        }
    }
}

/// Kills a process tree by pid. The child was moved into the waiting thread, so we
/// cannot signal it through `Child`: go through the OS, like `kill_child` in tunnel.rs.
fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

#[cfg(test)]
mod tests {
    use super::{wait_with_timeout, WaitError};
    use std::process::{Command, Stdio};
    use std::time::Duration;

    /// A program that stays alive for about `secs` seconds without needing a shell.
    fn sleeper(secs: u32) -> Command {
        #[cfg(windows)]
        let mut cmd = {
            let mut c = Command::new("ping");
            // `ping` sends one packet per second, so n+1 packets ≈ n seconds.
            c.args(["-n", &(secs + 1).to_string(), "127.0.0.1"]);
            c
        };
        #[cfg(not(windows))]
        let mut cmd = {
            let mut c = Command::new("sleep");
            c.arg(secs.to_string());
            c
        };
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        cmd
    }

    #[test]
    fn returns_the_output_of_a_program_that_finishes_in_time() {
        let child = sleeper(0).spawn().expect("spawn");
        let output = wait_with_timeout(child, Duration::from_secs(30)).ok().expect("no timeout");
        assert!(output.status.success());
        assert!(!output.stdout.is_empty());
    }

    #[test]
    fn kills_a_program_that_outlives_the_timeout() {
        let child = sleeper(30).spawn().expect("spawn");
        let pid = child.id();
        let err = wait_with_timeout(child, Duration::from_millis(300));
        assert!(matches!(err, Err(WaitError::TimedOut)));
        assert!(!is_running(pid), "el proceso siguió vivo después del timeout");
    }

    /// Asks the OS whether `pid` is still around, without adopting the process.
    fn is_running(pid: u32) -> bool {
        #[cfg(windows)]
        {
            let out = Command::new("tasklist")
                .args(["/FI", &format!("PID eq {pid}"), "/NH"])
                .output()
                .expect("tasklist");
            String::from_utf8_lossy(&out.stdout).contains(&pid.to_string())
        }
        #[cfg(not(windows))]
        {
            Command::new("kill")
                .args(["-0", &pid.to_string()])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
        }
    }
}

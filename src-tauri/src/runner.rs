//! Process runner: spawns AI CLIs, streams their stdout/stderr to the
//! frontend as Tauri events and allows killing them by run id.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Output, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

use crate::logging;

/// The stdin pipes of the runs started with `keep_stdin_open`, by run id.
///
/// Each pipe has its own lock, separate from the map's. `write_all` on a full pipe blocks until
/// the other side reads — the CLI is thinking, hung, or the message outgrew the OS buffer (a few
/// tens of KB on Windows, which a system prompt clears easily) — and a thread stuck there cannot
/// be holding a lock that anyone else needs, `kill_run` and `close_stdin` included. So the map's
/// lock only ever guards finding and removing an entry; the write itself happens against the
/// entry's own lock, taken after the map's is already released.
type Stdins = Arc<Mutex<HashMap<String, Arc<Mutex<ChildStdin>>>>>;

#[derive(Default)]
pub struct RunnerState {
    children: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
    /// Kept apart from the `Child` and not inside it on purpose: the thread that waits for a
    /// process to end takes the child's mutex every 50 ms to `try_wait` it, and a write to stdin
    /// has no business queueing behind that poll — nor making it wait. The two never touch.
    stdins: Stdins,
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
    /// Leave stdin open after the spawn instead of closing it. What every bidirectional protocol
    /// needs — ACP's JSON-RPC over stdio, `--input-format stream-json` — because there the process
    /// is one session and not one turn, and EOF is what ends it. See `write_stdin`/`close_stdin`.
    pub keep_stdin_open: Option<bool>,
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

/// Whether Windows would refuse this command line: an argument with a line break in it cannot be
/// passed to a `.cmd` or `.bat`, and the spawn fails with "batch file arguments are invalid".
fn needs_shim_unwrap(program: &str, args: &[String]) -> bool {
    let lower = program.to_ascii_lowercase();
    if !(lower.ends_with(".cmd") || lower.ends_with(".bat")) {
        return false;
    }
    args.iter().any(|a| a.contains('\n') || a.contains('\r'))
}

/// The two shapes of shim we can see through.
enum ShimTarget {
    /// A node script: run node on it.
    Script(std::path::PathBuf),
    /// A binary of its own: run it, and the batch file is out of the way.
    Exe(std::path::PathBuf),
}

/// What a shim actually runs: a node script, or an executable of its own.
///
/// The shim ends in a line like `"%_prog%"  "%dp0%\node_modules\pkg\cli.js" %*` — or, for a CLI
/// shipped as a binary, `"%dp0%\node_modules\pkg\bin\thing.exe" %*`. Either way what we need is
/// that quoted path, with `%dp0%` (or `%~dp0`) standing for the folder the shim is in.
fn target_of_shim(text: &str, shim_dir: &std::path::Path) -> Option<ShimTarget> {
    for piece in text.split('"') {
        let lower = piece.to_ascii_lowercase();
        let is_script = lower.ends_with(".js") || lower.ends_with(".mjs") || lower.ends_with(".cjs");
        let is_exe = lower.ends_with(".exe");
        if !is_script && !is_exe {
            continue;
        }
        let relative = piece
            .replace("%~dp0", "")
            .replace("%dp0%", "")
            .replace("%~dp0%", "");
        let relative = relative.trim_start_matches(['\\', '/']);
        let candidate = shim_dir.join(relative);
        if !candidate.is_file() {
            continue;
        }
        // `node.exe` next to the shim is the interpreter the shim would use, not its target.
        if is_exe && candidate.file_name().is_some_and(|n| n.eq_ignore_ascii_case("node.exe")) {
            continue;
        }
        return Some(if is_exe { ShimTarget::Exe(candidate) } else { ShimTarget::Script(candidate) });
    }
    None
}

/// Turns a batch shim into what it wraps, when the arguments leave no other way.
///
/// Returns the program and the arguments to use instead, or nothing when this is not a shim we
/// recognise — in which case the spawn is attempted as it was and fails as it did, which is at
/// least the error the user already knows (and `lib/errors.ts` explains it).
fn unwrap_shim(program: &str, args: &[String]) -> Option<(String, Vec<String>)> {
    if !needs_shim_unwrap(program, args) {
        return None;
    }
    let path = std::path::Path::new(program);
    let dir = path.parent()?;
    let text = std::fs::read_to_string(path).ok()?;

    match target_of_shim(&text, dir)? {
        ShimTarget::Exe(exe) => Some((exe.to_string_lossy().into_owned(), args.to_vec())),
        ShimTarget::Script(script) => {
            // npm's shim prefers the node next to it and falls back to the one on PATH; so do we.
            let local_node = dir.join("node.exe");
            let node = if local_node.is_file() {
                local_node.to_string_lossy().into_owned()
            } else {
                "node".to_string()
            };
            let mut out = Vec::with_capacity(args.len() + 1);
            out.push(script.to_string_lossy().into_owned());
            out.extend(args.iter().cloned());
            Some((node, out))
        }
    }
}

fn build_command(opts: &SpawnOptions) -> Command {
    // A system prompt is many lines, and a line break cannot be handed to a batch shim.
    let unwrapped = unwrap_shim(&opts.program, &opts.args);
    let (program, args) = match &unwrapped {
        Some((program, args)) => (program.as_str(), args.as_slice()),
        None => (opts.program.as_str(), opts.args.as_slice()),
    };
    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdin(if opts.stdin_text.is_some() || opts.keep_stdin_open.unwrap_or(false) {
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
        // `CREATE_NO_WINDOW` leaves the agent with no console — and then every console program the
        // agent itself runs asks Windows for one, gets a new one, and that one is visible. With a
        // console of our own to hand down (`console::share_console`), inheriting it is what keeps
        // the whole tree quiet. The flag is the fallback for when there was none to share.
        if !crate::console::is_shared() {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
    }
    cmd
}

/// A `taskkill` or a `tasklist` that does not flash a console window on the user's screen.
///
/// `Stdio::null()` silences the output but says nothing about the window: a console program
/// started from a GUI app gets one allocated for it unless `CREATE_NO_WINDOW` says otherwise. The
/// spawns that run an agent always passed the flag; the housekeeping ones around them did not, so
/// every stop, every close and every stale-pid check blinked a black rectangle over whatever the
/// user was looking at.
#[cfg(windows)]
fn windowless(program: &str) -> Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut cmd = Command::new(program);
    cmd.creation_flags(CREATE_NO_WINDOW);
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

/// What the frontend needs to find this process again after the app has died and come back.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Spawned {
    pub pid: u32,
    pub image: String,
}

/// The image name the OS reports for a pid, read from the same source `reap_orphans` reads, so
/// the two are comparable. Only this pid is scanned: refreshing every process is not free.
fn image_of(pid: u32) -> Option<String> {
    let key = sysinfo::Pid::from_u32(pid);
    let mut system = sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[key]), true);
    system.process(key).map(|p| p.name().to_string_lossy().into_owned())
}

#[tauri::command]
pub fn spawn_run(
    app: AppHandle,
    state: State<'_, RunnerState>,
    opts: SpawnOptions,
) -> Result<Spawned, String> {
    let mut cmd = build_command(&opts);
    let mut child = cmd.spawn().map_err(|e| {
        let msg = format!("No se pudo iniciar `{}`: {e}", opts.program);
        logging::append(&app, "error", "runner", &format!("run {}: {msg}", opts.run_id));
        msg
    })?;
    // Handed back so the run can be written down with them. A crash never reaches `shutdown`, and
    // the CLI it started keeps working on the repo with nobody left to read its output: the next
    // launch needs these to find that process again, and to be sure it is still that one and not
    // whatever inherited its pid (see `reap_orphans`).
    let pid = child.id();
    let image = image_of(pid).unwrap_or_default();
    logging::append(
        &app,
        "info",
        "runner",
        &format!("run {} inicia: {} {}", opts.run_id, opts.program, opts.args.join(" ")),
    );

    // A bidirectional run holds on to the pipe; the write itself waits until the output pumps are
    // up, a few lines below, so a first message bigger than the pipe buffer cannot deadlock against
    // a child that is already answering.
    let keep_stdin_open = opts.keep_stdin_open.unwrap_or(false);
    let mut held_stdin = if keep_stdin_open { child.stdin.take() } else { None };

    if !keep_stdin_open {
        if let Some(text) = opts.stdin_text.clone() {
            if let Some(mut stdin) = child.stdin.take() {
                thread::spawn(move || {
                    let _ = stdin.write_all(text.as_bytes());
                    let _ = stdin.flush();
                    // dropping stdin closes the pipe so the CLI sees EOF
                });
            }
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

    // Registered before the waiter thread exists, so an agent that dies at once cannot have its
    // entry removed by the cleanup below and then put back here, leaking the handle.
    if let Some(mut stdin) = held_stdin.take() {
        if let Some(text) = &opts.stdin_text {
            if let Err(e) = stdin.write_all(text.as_bytes()).and_then(|_| stdin.flush()) {
                logging::append(
                    &app,
                    "warn",
                    "runner",
                    &format!("run {run_id}: first stdin write failed: {e}"),
                );
            }
        }
        state.stdins.lock().unwrap().insert(run_id.clone(), Arc::new(Mutex::new(stdin)));
    }

    let children = state.children.clone();
    let stdins = state.stdins.clone();
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
        // The process is gone: a `ChildStdin` still alive here is an OS handle nobody can use.
        stdins.lock().unwrap().remove(&run_id);
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

    Ok(Spawned { pid, image })
}

#[tauri::command]
pub fn kill_run(state: State<'_, RunnerState>, run_id: String) -> Result<bool, String> {
    state.stdins.lock().unwrap().remove(&run_id);
    let child = state.children.lock().unwrap().remove(&run_id);
    match child {
        Some(c) => {
            let mut c = c.lock().unwrap();
            #[cfg(windows)]
            {
                // Kill the whole tree: node-based CLIs spawn helpers.
                let pid = c.id();
                let _ = windowless("taskkill")
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

/// Writes `text` to a live run's stdin, exactly as given.
///
/// The framing is the caller's: a JSON-RPC message ends in a newline and a raw prompt may not, and
/// this side of the wire has no way to tell them apart. Answers `false` when the run has no stdin
/// registered — it already ended, or it was not started with `keep_stdin_open` — which is a fact
/// about the run and not an error. Only a write that actually fails is one.
fn write_stdin_to(stdins: &Stdins, run_id: &str, text: &str) -> Result<bool, String> {
    // Only the map's lock is needed to find the pipe; it is dropped here, before the write, so a
    // write that blocks on a full pipe never holds up anyone else's write, nor `kill_run` or
    // `close_stdin`, which only ever need the map's lock and not this run's.
    let stdin = {
        let map = stdins.lock().unwrap();
        let Some(stdin) = map.get(run_id) else {
            return Ok(false);
        };
        stdin.clone()
    };
    let mut stdin = stdin.lock().map_err(|e| e.to_string())?;
    match stdin.write_all(text.as_bytes()).and_then(|_| stdin.flush()) {
        Ok(()) => Ok(true),
        Err(e) => {
            // A broken pipe never heals: keeping the entry would only fail every later write.
            stdins.lock().unwrap().remove(run_id);
            Err(e.to_string())
        }
    }
}

/// Drops a run's stdin, which is what sends the CLI EOF. `false` when there was none.
///
/// This only ever needs the map's lock, so it never waits on a write in progress. If one is
/// happening when this runs, removing the entry here drops the map's `Arc` and not the `ChildStdin`
/// itself — that write still holds its own clone of it, and the pipe only actually closes once the
/// write finishes and releases it. That is fine: it is `remove` waiting on the write, and not the
/// other way around, that would bring back the deadlock this whole scheme exists to avoid.
fn close_stdin_of(stdins: &Stdins, run_id: &str) -> bool {
    stdins.lock().unwrap().remove(run_id).is_some()
}

#[tauri::command]
pub fn write_stdin(state: State<'_, RunnerState>, run_id: String, text: String) -> Result<bool, String> {
    write_stdin_to(&state.stdins, &run_id, &text)
}

/// Sends EOF to a run that was started with `keep_stdin_open`, leaving the process to finish on its
/// own. `false` when that run has no stdin open.
#[tauri::command]
pub fn close_stdin(state: State<'_, RunnerState>, run_id: String) -> Result<bool, String> {
    Ok(close_stdin_of(&state.stdins, &run_id))
}

/// Kills every agent process still running (whole trees on Windows). Called when the app exits so
/// no implementer keeps editing a workspace with nobody watching.
pub fn shutdown(app: &tauri::AppHandle) {
    use tauri::Manager;
    let state = app.state::<RunnerState>();
    state.stdins.lock().unwrap().clear();
    let children: Vec<(String, Arc<Mutex<Child>>)> = state.children.lock().unwrap().drain().collect();
    for (run_id, child) in children {
        let mut c = child.lock().unwrap();
        #[cfg(windows)]
        {
            let pid = c.id();
            let _ = windowless("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
        let _ = c.kill();
        crate::logging::append(app, "warn", "runner", &format!("run {run_id} killed on app shutdown"));
    }
}

#[tauri::command]
pub fn running_runs(state: State<'_, RunnerState>) -> Vec<String> {
    state.children.lock().unwrap().keys().cloned().collect()
}

/// One run a previous instance of the app left running, as the frontend wrote it down.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Orphan {
    pub run_id: String,
    pub pid: u32,
    /// The image the run was started as, taken from the process itself at spawn time.
    pub image: String,
    /// When the run started, in milliseconds since the epoch.
    pub started_at: i64,
}

/// How far the process's own start time may sit from the run's before they are not the same thing.
const START_SLACK_MS: i64 = 120_000;

/// Whether the process now holding a pid is still the one that run started.
///
/// The whole safety of reaping rests here. A pid says nothing on its own — the operating system
/// hands them out again, and the next holder is as likely to be the user's dev server as an agent.
/// Both the image and the moment it started have to agree before anything is killed.
///
/// `process_start_secs` is whole seconds since the epoch, as the OS reports it; `started_at_ms` is
/// the run's own timestamp in milliseconds.
fn should_reap(process_name: &str, process_start_secs: u64, image: &str, started_at_ms: i64) -> bool {
    if image.is_empty() || process_name != image {
        return false;
    }
    let drift = (process_start_secs as i64) * 1000 - started_at_ms;
    drift.abs() <= START_SLACK_MS
}

/// Kills the CLI processes a crashed instance of the app left behind.
///
/// A clean exit goes through `shutdown` and takes every agent with it; a crash never gets there,
/// and the CLIs keep editing the workspace with nobody reading their output. This is the next
/// launch cleaning up after that one.
///
/// A pid on its own is not proof of anything: the operating system reuses them, and killing a
/// recycled one would take down whatever holds it now — the user's own dev server, say, which is
/// as likely to be `node.exe` as an agent is. So a process is only killed when its image *and* its
/// start time still match the run that recorded it. Returns the ids of the runs actually killed.
#[tauri::command]
pub async fn reap_orphans(app: AppHandle, orphans: Vec<Orphan>) -> Vec<String> {
    tauri::async_runtime::spawn_blocking(move || reap_orphans_blocking(app, orphans))
        .await
        .unwrap_or_default()
}

fn reap_orphans_blocking(app: AppHandle, orphans: Vec<Orphan>) -> Vec<String> {
    if orphans.is_empty() {
        return Vec::new();
    }
    let mut system = sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut killed = Vec::new();
    for orphan in orphans {
        let Some(process) = system.process(sysinfo::Pid::from_u32(orphan.pid)) else {
            continue; // Already gone: nothing to clean up.
        };
        if !should_reap(
            &process.name().to_string_lossy(),
            process.start_time(),
            &orphan.image,
            orphan.started_at,
        ) {
            continue;
        }
        kill_tree(orphan.pid);
        logging::append(
            &app,
            "warn",
            "runner",
            &format!(
                "run {}: proceso {} ({}) quedó vivo tras un cierre inesperado, matado",
                orphan.run_id, orphan.pid, orphan.image
            ),
        );
        killed.push(orphan.run_id);
    }
    killed
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

/// This command must remain `async`: a synchronous Tauri command runs on the main thread that
/// pumps window messages. Because `exec_capture` blocks waiting for child process execution
/// (up to 60 seconds), running synchronously freezes the message pump. On Windows, window dragging
/// uses a modal loop on that main thread, so blocking it causes dragging to freeze and jump.
/// Offloading execution to `spawn_blocking` keeps the main thread responsive.
#[tauri::command]
pub async fn exec_capture(
    app: AppHandle,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<ExecResult, String> {
    tauri::async_runtime::spawn_blocking(move || exec_capture_blocking(app, program, args, cwd, timeout_secs))
        .await
        .map_err(|e| e.to_string())?
}

fn exec_capture_blocking(
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
    
    // Not `build_command`'s reasoning, because this is not an agent. What comes through here is a
    // probe — `agy models`, `git rev-parse`, `gh auth token` — that captures its output and is over
    // in seconds. It runs no tree that needs a console to inherit, so it gets none: the flag its
    // two siblings already pass, `detect.rs` for version probes and `windowless` for housekeeping.
    //
    // Inheriting instead was the odd one out, and it is not free. Hiding the console we allocate
    // relies on `ShowWindow` reaching the window that shows it — which on Windows 11, where the
    // default console host is Windows Terminal in a process of its own, it does not. A child that
    // draws a spinner then brings that window up, and `agy models` draws one.
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
pub(crate) fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = windowless("taskkill")
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

    // ---- Reaping what a crash left behind (see `should_reap`) ----

    /// A run started at this moment, in milliseconds; its process reports the same in seconds.
    const RUN_MS: i64 = 1_764_000_000_000;
    const PROC_SECS: u64 = 1_764_000_000;

    #[test]
    fn reaps_the_process_that_is_still_the_one_the_run_started() {
        assert!(super::should_reap("node.exe", PROC_SECS, "node.exe", RUN_MS));
        // Started a little before the run was written down: still the same launch.
        assert!(super::should_reap("node.exe", PROC_SECS - 30, "node.exe", RUN_MS));
    }

    #[test]
    fn refuses_a_pid_now_held_by_something_else() {
        // The user's own editor, or anything at all: same pid, different program.
        assert!(!super::should_reap("Code.exe", PROC_SECS, "node.exe", RUN_MS));
    }

    #[test]
    fn refuses_the_same_program_started_at_another_time() {
        // The dangerous case: the dev server is `node.exe` too. Only the clock tells them apart.
        assert!(!super::should_reap("node.exe", PROC_SECS + 3_600, "node.exe", RUN_MS));
        assert!(!super::should_reap("node.exe", PROC_SECS - 3_600, "node.exe", RUN_MS));
    }

    #[test]
    fn refuses_a_run_that_never_recorded_an_image() {
        // Older runs, and any spawn whose image could not be read: nothing to match against.
        assert!(!super::should_reap("node.exe", PROC_SECS, "", RUN_MS));
    }

    /// The assumption everything above rests on: that the OS, through sysinfo, reports the image
    /// name and the start time of a process we started in the units `should_reap` expects. Spawns
    /// a real one rather than trusting the documentation.
    #[test]
    fn reads_a_real_process_the_way_should_reap_expects() {
        use std::process::{Command, Stdio};
        let started_at_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        #[cfg(windows)]
        let mut child = Command::new("ping")
            .args(["-n", "30", "127.0.0.1"])
            .stdout(Stdio::null())
            .spawn()
            .expect("spawn");
        #[cfg(not(windows))]
        let mut child = Command::new("sleep").arg("30").stdout(Stdio::null()).spawn().expect("spawn");

        let pid = child.id();
        let image = super::image_of(pid).expect("the process we just started must be visible");
        assert!(!image.is_empty());

        let key = sysinfo::Pid::from_u32(pid);
        let mut system = sysinfo::System::new();
        system.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[key]), true);
        let process = system.process(key).expect("still running");

        assert!(
            super::should_reap(&process.name().to_string_lossy(), process.start_time(), &image, started_at_ms),
            "image {image}, start {} vs run {started_at_ms}",
            process.start_time(),
        );
        // And the same process is refused once it is claimed to be a much older run.
        assert!(!super::should_reap(
            &process.name().to_string_lossy(),
            process.start_time(),
            &image,
            started_at_ms - 3_600_000,
        ));

        let _ = child.kill();
        let _ = child.wait();
    }

    // ---- Keeping stdin open (see `write_stdin`/`close_stdin`) ----

    /// A stand-in for an agent that speaks a bidirectional protocol: NDJSON in, NDJSON out, and it
    /// ends by itself on EOF. No CLI installed here speaks ACP, and the pipe is what is under test,
    /// not the protocol — so the fake one is enough and it depends on nothing but node.
    const FAKE_AGENT: &str = r#"
const rl = require("readline").createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  process.stdout.write(JSON.stringify({ id: msg.id, pong: msg.method }) + "\n");
});
rl.on("close", () => process.exit(0));
"#;

    /// Writes the fake agent to its own temp folder and answers the options that run it.
    fn fake_agent(run_id: &str, keep_stdin_open: Option<bool>) -> (super::SpawnOptions, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("ainess-acp-{run_id}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join("agent.js");
        std::fs::write(&script, FAKE_AGENT).unwrap();
        let opts = super::SpawnOptions {
            run_id: run_id.to_string(),
            program: if cfg!(windows) { "node.exe".to_string() } else { "node".to_string() },
            args: vec![script.to_string_lossy().into_owned()],
            cwd: None,
            stdin_text: None,
            keep_stdin_open,
            env: Default::default(),
        };
        (opts, dir)
    }

    #[test]
    fn writes_two_messages_to_a_live_process_and_ends_it_with_eof() {
        use std::io::BufRead;
        let (opts, dir) = fake_agent("live", Some(true));
        let mut child = super::build_command(&opts).spawn().expect("node must be on PATH");
        let stdin = child.stdin.take().expect("keep_stdin_open asks for a pipe");
        let mut lines = std::io::BufReader::new(child.stdout.take().unwrap()).lines();

        let stdins: super::Stdins = Default::default();
        stdins.lock().unwrap().insert("live".to_string(), std::sync::Arc::new(std::sync::Mutex::new(stdin)));

        assert!(super::write_stdin_to(&stdins, "live", "{\"id\":1,\"method\":\"initialize\"}\n").unwrap());
        let first = lines.next().expect("an answer").unwrap();
        assert!(first.contains("\"id\":1") && first.contains("initialize"), "{first}");

        // The point of the whole change: the process is still there for a second message.
        assert!(super::write_stdin_to(&stdins, "live", "{\"id\":2,\"method\":\"prompt\"}\n").unwrap());
        let second = lines.next().expect("a second answer").unwrap();
        assert!(second.contains("\"id\":2") && second.contains("prompt"), "{second}");

        assert!(super::close_stdin_of(&stdins, "live"));
        // EOF, and nothing had to kill it.
        let status = child.wait().unwrap();
        assert!(status.success(), "{status:?}");
        assert!(!super::close_stdin_of(&stdins, "live"), "the entry is gone once closed");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn writing_to_a_run_that_is_not_there_answers_false() {
        // The run ended between the caller reading the state and writing: a fact, not an error.
        let stdins: super::Stdins = Default::default();
        assert_eq!(super::write_stdin_to(&stdins, "gone", "{}\n"), Ok(false));
        assert!(!super::close_stdin_of(&stdins, "gone"));
    }

    /// The whole point of the per-run lock: a write stuck on a full pipe must not hold up a write
    /// to a different run, nor that other run's `close_stdin`. `sleeper` never reads its stdin, so
    /// a write bigger than the OS pipe buffer (Windows: a few tens of KB) blocks on it for as long
    /// as the process lives; a second run is meanwhile written to and closed from another thread,
    /// with a bounded wait so a regression here fails the test instead of hanging the suite.
    #[test]
    fn a_write_stuck_on_a_full_pipe_does_not_block_another_runs_stdin() {
        use std::sync::{mpsc, Arc, Mutex};

        let mut blocked_child = sleeper(5).stdin(Stdio::piped()).spawn().expect("spawn");
        let blocked_stdin = blocked_child.stdin.take().expect("stdin(Stdio::piped()) above");

        let (fast_opts, fast_dir) = fake_agent("unblocked", Some(true));
        let mut fast_child = super::build_command(&fast_opts).spawn().expect("node must be on PATH");
        let fast_stdin = fast_child.stdin.take().expect("keep_stdin_open asks for a pipe");

        let stdins: super::Stdins = Default::default();
        stdins.lock().unwrap().insert("blocked".to_string(), Arc::new(Mutex::new(blocked_stdin)));
        stdins.lock().unwrap().insert("unblocked".to_string(), Arc::new(Mutex::new(fast_stdin)));

        let blocking_stdins = stdins.clone();
        let blocking_write = thread::spawn(move || {
            let _ = super::write_stdin_to(&blocking_stdins, "blocked", &"x".repeat(1024 * 1024));
        });

        // Give the write above time to reach the pipe and actually fill it.
        thread::sleep(Duration::from_millis(200));

        let (tx, rx) = mpsc::channel();
        let other_stdins = stdins.clone();
        thread::spawn(move || {
            let wrote = super::write_stdin_to(&other_stdins, "unblocked", "{\"id\":1,\"method\":\"ping\"}\n");
            let closed = super::close_stdin_of(&other_stdins, "unblocked");
            let _ = tx.send((wrote, closed));
        });
        let (wrote, closed) = rx
            .recv_timeout(Duration::from_secs(5))
            .expect("another run's stdin must not wait on the one stuck on a full pipe");
        assert_eq!(wrote, Ok(true));
        assert!(closed);

        let _ = fast_child.wait();
        let _ = blocked_child.kill();
        let _ = blocked_child.wait();
        let _ = blocking_write.join();
        let _ = std::fs::remove_dir_all(&fast_dir);
    }

    /// The old path, untouched: no `keep_stdin_open`, so the prompt is written and the pipe closed,
    /// and the process ends on the EOF that closing it sends.
    #[test]
    fn still_closes_stdin_when_nobody_asked_to_keep_it_open() {
        use std::io::Write;
        let (mut opts, dir) = fake_agent("classic", None);
        opts.stdin_text = Some("{\"id\":7,\"method\":\"once\"}\n".to_string());
        let mut child = super::build_command(&opts).spawn().expect("node must be on PATH");
        {
            let mut stdin = child.stdin.take().expect("stdin_text asks for a pipe");
            stdin.write_all(opts.stdin_text.as_ref().unwrap().as_bytes()).unwrap();
        } // dropped: EOF
        let out = child.wait_with_output().unwrap();
        assert!(out.status.success());
        assert!(String::from_utf8_lossy(&out.stdout).contains("\"id\":7"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---- Batch shims (see `unwrap_shim`) ----

    /// What npm writes to `%APPDATA%\npm\<name>.cmd`, trimmed to the line that matters.
    fn npm_shim(script: &str) -> String {
        format!(
            "@ECHO off\r\nSETLOCAL\r\nCALL :find_dp0\r\nIF EXIST \"%dp0%\\node.exe\" (\r\n  SET \"_prog=%dp0%\\node.exe\"\r\n) ELSE (\r\n  SET \"_prog=node\"\r\n)\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & \"%_prog%\"  \"%dp0%\\{script}\" %*\r\n"
        )
    }

    fn temp_shim(name: &str, script_rel: &str) -> (std::path::PathBuf, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("ainess-shim-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let script = dir.join(script_rel);
        std::fs::create_dir_all(script.parent().unwrap()).unwrap();
        std::fs::write(&script, "// cli").unwrap();
        let shim = dir.join(format!("{name}.cmd"));
        std::fs::write(&shim, npm_shim(&script_rel.replace('/', "\\"))).unwrap();
        (shim, script)
    }

    #[test]
    fn runs_the_script_a_shim_wraps_when_an_argument_has_a_line_break() {
        let (shim, script) = temp_shim("claude", "node_modules/pkg/cli.js");
        let args = vec!["--append-system-prompt".to_string(), "one\ntwo".to_string()];
        let (program, out) = super::unwrap_shim(shim.to_str().unwrap(), &args).expect("shim");
        assert!(program.ends_with("node.exe") || program == "node", "{program}");
        assert_eq!(
            std::fs::canonicalize(&out[0]).unwrap(),
            std::fs::canonicalize(&script).unwrap(),
        );
        assert_eq!(&out[1..], &args[..]);
        let _ = std::fs::remove_dir_all(shim.parent().unwrap());
    }

    /// Nothing changes for a command line Windows accepts as it is.
    /// End to end: the same shim and the same multi-line argument that Windows rejects, through
    /// the command the runner actually builds.
    #[test]
    fn spawns_a_shim_with_a_multi_line_argument() {
        use super::{build_command, SpawnOptions};
        let dir = std::env::temp_dir().join(format!("ainess-shim-e2e-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let script = dir.join("node_modules").join("probe").join("cli.js");
        std::fs::create_dir_all(script.parent().unwrap()).unwrap();
        std::fs::write(&script, "process.stdout.write(process.argv.slice(2).join('|'));").unwrap();
        let shim = dir.join("probe.cmd");
        std::fs::write(&shim, npm_shim(r"node_modules\probe\cli.js")).unwrap();

        let opts = SpawnOptions {
            run_id: "t".into(),
            program: shim.to_string_lossy().into_owned(),
            args: vec!["--append-system-prompt".into(), "one
two".into()],
            cwd: None,
            stdin_text: None,
            keep_stdin_open: None,
            env: Default::default(),
        };

        // Straight at the shim this is the failure the user reported.
        let direct = Command::new(&shim).arg("one
two").output();
        assert!(direct.is_err(), "Windows used to accept this: the workaround is no longer needed");

        let out = build_command(&opts).stdout(Stdio::piped()).output().expect("spawn");
        assert!(out.status.success());
        assert_eq!(String::from_utf8_lossy(&out.stdout), "--append-system-prompt|one
two");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Some CLIs ship a binary and the shim only points at it (opencode, bun): then the batch
    /// file steps aside entirely and the binary takes the arguments as they are.
    #[test]
    fn runs_the_executable_a_shim_points_at() {
        let dir = std::env::temp_dir().join(format!("ainess-shim-exe-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let exe = dir.join("node_modules").join("pkg").join("bin").join("thing.exe");
        std::fs::create_dir_all(exe.parent().unwrap()).unwrap();
        std::fs::write(&exe, "not really a binary").unwrap();
        let shim = dir.join("thing.cmd");
        let content = format!("@ECHO off\r\nCALL :find_dp0\r\n{}\r\n", r#""%dp0%\node_modules\pkg\bin\thing.exe"   %*"#);
        std::fs::write(&shim, content).unwrap();

        let args = vec!["one\ntwo".to_string()];
        let (program, out) = super::unwrap_shim(shim.to_str().unwrap(), &args).expect("shim");
        assert_eq!(
            std::fs::canonicalize(&program).unwrap(),
            std::fs::canonicalize(&exe).unwrap(),
        );
        assert_eq!(out, args);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn leaves_the_shim_alone_when_every_argument_is_one_line() {
        let (shim, _) = temp_shim("plain", "node_modules/pkg/cli.js");
        let args = vec!["--version".to_string()];
        assert!(super::unwrap_shim(shim.to_str().unwrap(), &args).is_none());
        let _ = std::fs::remove_dir_all(shim.parent().unwrap());
    }

    #[test]
    fn leaves_a_real_executable_alone() {
        let args = vec!["one\ntwo".to_string()];
        assert!(super::unwrap_shim("C:\\tools\\agy.exe", &args).is_none());
    }

    /// A shim whose script is not there (a broken or unfamiliar one) is left as it was.
    #[test]
    fn gives_up_on_a_shim_it_does_not_recognise() {
        let dir = std::env::temp_dir().join(format!("ainess-shim-odd-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let shim = dir.join("odd.cmd");
        std::fs::write(&shim, "@echo off\r\nsome-other-tool %*\r\n").unwrap();
        let args = vec!["one\ntwo".to_string()];
        assert!(super::unwrap_shim(shim.to_str().unwrap(), &args).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    use super::{wait_with_timeout, WaitError};
    use std::process::{Command, Stdio};
    use std::thread;
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

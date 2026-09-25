//! A JavaScript runtime and the ACP adapter, installed by the app into its own folder.
//!
//! Claude Code is spoken to over ACP by an npm package (`@agentclientprotocol/claude-agent-acp`),
//! and until now the only ways to start it were a `claude-agent-acp` already on PATH or
//! `npx -y @agentclientprotocol/claude-agent-acp`. Both of those are node, so a machine without
//! node could not run Claude at all.
//!
//! Nothing is shipped in the installer. The adapter drags in `@anthropic-ai/claude-agent-sdk` and
//! its platform package (the one that carries `claude.exe`, 226 MB), and both are Anthropic's,
//! "all rights reserved": putting them in our installer is redistribution, fetching them from the
//! official registry onto the user's own machine is not. So this module does the second thing: it
//! downloads **bun** (MIT, one executable that is both runtime and package manager) into the app's
//! config folder and installs the adapter there with it.
//!
//! Everything lands under the app's config dir, the one `config.json` already lives in:
//!
//! ```text
//! runtime/bun/bun.exe          the runtime (`bun` off Windows)
//! acp/package.json             one dependency: the adapter, at ACP_ADAPTER_RANGE
//! acp/node_modules/            the adapter, the Agent SDK and the engine
//! acp/.cache/                  bun's package cache, kept here and not in the user's home
//! acp/installed.json           the marker that says the install finished
//! ```

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State as TauriState};

use crate::logging;

/// The bun release this app installs.
///
/// To bump it: pick the tag of a stable release at https://github.com/oven-sh/bun/releases (they
/// are named `bun-v<VERSION>`), put the version here, and nothing else — the checksums are fetched
/// from that same release, so they move with it.
const BUN_VERSION: &str = "1.4.2";

/// The adapter version range written into `acp/package.json`. 0.81.2 is the tested one.
///
/// Bumping this reinstalls by itself: the marker records the range it was installed with, and a
/// range that no longer matches makes `adapterReady` false.
const ACP_ADAPTER_RANGE: &str = "^0.81.2";

/// The npm package that speaks ACP for Claude Code (same constant as in src/lib/acp/adapter.ts).
const ACP_ADAPTER_PACKAGE: &str = "@agentclientprotocol/claude-agent-acp";
/// What that package's `bin` points at, inside its own folder.
const ACP_ADAPTER_ENTRY: [&str; 2] = ["dist", "index.js"];

/// `bun install` pulls ~280 MB over a connection we know nothing about.
const INSTALL_TIMEOUT: Duration = Duration::from_secs(20 * 60);

// ---- Paths ---------------------------------------------------------------------------------------

/// Everywhere this module reads or writes, derived from one root.
///
/// A struct and not a pile of `join`s at each call site, so the layout is written down once and the
/// tests can build it over any folder.
#[derive(Clone)]
pub struct Paths {
    pub runtime_dir: PathBuf,
    pub bun: PathBuf,
    pub acp_dir: PathBuf,
    pub package_json: PathBuf,
    pub node_modules: PathBuf,
    pub cache_dir: PathBuf,
    pub marker: PathBuf,
}

fn paths_in(root: &Path) -> Paths {
    let runtime_dir = root.join("runtime").join("bun");
    let acp_dir = root.join("acp");
    Paths {
        bun: runtime_dir.join(if cfg!(windows) { "bun.exe" } else { "bun" }),
        runtime_dir,
        package_json: acp_dir.join("package.json"),
        node_modules: acp_dir.join("node_modules"),
        cache_dir: acp_dir.join(".cache"),
        marker: acp_dir.join("installed.json"),
        acp_dir,
    }
}

fn root_of(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

// ---- Targets -------------------------------------------------------------------------------------

/// Which bun build this machine takes, as it is named in the release assets.
///
/// `None` for anything bun publishes no plain build for (32-bit, freebsd): there the managed
/// runtime simply never becomes ready and the npx path stays the only way in.
fn bun_target(os: &str, arch: &str) -> Option<&'static str> {
    match (os, arch) {
        ("windows", "x86_64") => Some("windows-x64"),
        ("macos", "aarch64") => Some("darwin-aarch64"),
        ("macos", "x86_64") => Some("darwin-x64"),
        ("linux", "x86_64") => Some("linux-x64"),
        ("linux", "aarch64") => Some("linux-aarch64"),
        _ => None,
    }
}

/// The engine package for this machine: `@anthropic-ai/claude-agent-sdk-win32-x64` and friends.
///
/// Named the way npm names platforms (node's `process.platform`-`process.arch`), which is not how
/// bun names its own builds — hence two mappings instead of one.
fn engine_package(os: &str, arch: &str) -> Option<String> {
    let platform = match os {
        "windows" => "win32",
        "macos" => "darwin",
        "linux" => "linux",
        _ => return None,
    };
    let cpu = match arch {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        _ => return None,
    };
    Some(format!("@anthropic-ai/claude-agent-sdk-{platform}-{cpu}"))
}

// ---- Status --------------------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AcpManagedStatus {
    /// A bun we installed is sitting where we put it.
    pub runtime_ready: bool,
    /// The adapter is installed, and installed with the range this build asks for.
    pub adapter_ready: bool,
    pub bun_version: Option<String>,
    pub adapter_version: Option<String>,
    /// What to spawn to start the adapter, once both are ready.
    pub program: Option<String>,
    pub args: Vec<String>,
    pub install_dir: String,
    /// The `claude` binary of the engine package, when it is there.
    pub engine_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct Marker {
    range: String,
    adapter_version: Option<String>,
    bun_version: String,
    installed_at: u64,
}

/// What the installed adapter's own `package.json` says its version is.
fn adapter_version_in(node_modules: &Path) -> Option<String> {
    let manifest = node_modules
        .join("@agentclientprotocol")
        .join("claude-agent-acp")
        .join("package.json");
    let text = std::fs::read_to_string(manifest).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    json.get("version")?.as_str().map(str::to_string)
}

/// The engine binary inside the installed tree, if the optional platform package came down.
///
/// The musl build is looked at too: that is the one a musl linux resolves instead of the plain one.
fn engine_path_in(node_modules: &Path, os: &str, arch: &str) -> Option<PathBuf> {
    let base = engine_package(os, arch)?;
    let binary = if os == "windows" { "claude.exe" } else { "claude" };
    for name in [base.clone(), format!("{base}-musl")] {
        let (scope, pkg) = name.split_once('/')?;
        let candidate = node_modules.join(scope).join(pkg).join(binary);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Whether the adapter has to be installed again.
///
/// Three reasons, and the third is the point of the marker: a build that bumped
/// `ACP_ADAPTER_RANGE` reinstalls on its own, without anyone having to clear a folder by hand.
fn needs_install(marker: Option<&str>, node_modules_present: bool, range: &str) -> bool {
    if !node_modules_present {
        return true;
    }
    let Some(text) = marker else { return true };
    match serde_json::from_str::<Marker>(text) {
        Ok(m) => m.range != range,
        Err(_) => true,
    }
}

fn status_in(paths: &Paths) -> AcpManagedStatus {
    let runtime_ready = paths.bun.is_file();
    let marker = std::fs::read_to_string(&paths.marker).ok();
    let entry = paths
        .node_modules
        .join("@agentclientprotocol")
        .join("claude-agent-acp")
        .join(ACP_ADAPTER_ENTRY[0])
        .join(ACP_ADAPTER_ENTRY[1]);
    let adapter_ready = !needs_install(
        marker.as_deref(),
        paths.node_modules.is_dir(),
        ACP_ADAPTER_RANGE,
    ) && entry.is_file();

    let bun_version = marker
        .as_deref()
        .and_then(|t| serde_json::from_str::<Marker>(t).ok())
        .map(|m| m.bun_version)
        .or_else(|| runtime_ready.then(|| BUN_VERSION.to_string()));

    // `bun run <file>` and not the `.bin` shim bun leaves behind: that shim on Windows is a small
    // `.exe` that looks for bun the way the shell would, and the whole point here is a machine
    // where nothing is on PATH.
    let (program, args) = if runtime_ready && adapter_ready {
        (
            Some(paths.bun.to_string_lossy().to_string()),
            vec!["run".to_string(), entry.to_string_lossy().to_string()],
        )
    } else {
        (None, Vec::new())
    };

    AcpManagedStatus {
        runtime_ready,
        adapter_ready,
        bun_version,
        adapter_version: adapter_version_in(&paths.node_modules),
        program,
        args,
        install_dir: paths.acp_dir.to_string_lossy().to_string(),
        engine_path: engine_path_in(
            &paths.node_modules,
            std::env::consts::OS,
            std::env::consts::ARCH,
        )
        .map(|p| p.to_string_lossy().to_string()),
    }
}

// ---- Progress ------------------------------------------------------------------------------------

/// One step of the install, as the window hears about it.
///
/// The messages are English and they are not UI: they go to the log, and the screen that shows them
/// translates the *phase*, never the sentence.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SetupProgress {
    /// `runtime-download` | `runtime-verify` | `runtime-extract` | `adapter-install` | `ready` | `error`
    pub phase: String,
    pub received: Option<u64>,
    pub total: Option<u64>,
    pub message: Option<String>,
}

/// Where a step goes once it has happened.
///
/// A closure and not the `AppHandle` itself, because the installer is the one piece here worth
/// running for real in a test, and a test has no window to emit into — it prints instead (see
/// `installs_bun_and_the_adapter_for_real`). Shared, because `bun install` is relayed from the two
/// threads reading its pipes.
pub type Report = std::sync::Arc<dyn Fn(SetupProgress) + Send + Sync>;

/// The reporter the app uses: the log gets the sentence, the window gets the event.
fn reporter(app: &AppHandle) -> Report {
    let app = app.clone();
    std::sync::Arc::new(move |progress: SetupProgress| {
        if let Some(text) = progress.message.as_deref() {
            let level = if progress.phase == "error" { "error" } else { "info" };
            logging::append(&app, level, "acp-setup", text);
        }
        let _ = app.emit("acp-setup", progress);
    })
}

fn say(report: &Report, phase: &str, received: Option<u64>, total: Option<u64>, message: Option<String>) {
    report(SetupProgress {
        phase: phase.to_string(),
        received,
        total,
        message,
    });
}

// ---- State ---------------------------------------------------------------------------------------

/// One install at a time, and a way to stop it.
///
/// The mutex is what keeps two runs that start together from downloading bun twice: the second one
/// waits on it, and by the time it gets in the work is done, so all it does is re-read the status.
#[derive(Default)]
pub struct AcpSetupState {
    installing: tokio::sync::Mutex<()>,
    shared: std::sync::Arc<Shared>,
}

/// The part of the state the install itself carries around.
///
/// Split off and behind an `Arc` because `bun install` runs on a blocking thread — it takes twenty
/// minutes of waiting on a pipe, which is not something to do on the async runtime's workers — and
/// that thread still has to see a cancel arrive and hand back the pid to kill.
#[derive(Default)]
struct Shared {
    cancelled: AtomicBool,
    /// The pid of the `bun install` running right now, so `acp_managed_cancel` has something to kill.
    child: Mutex<Option<u32>>,
}

fn cancelled(shared: &Shared) -> bool {
    shared.cancelled.load(Ordering::SeqCst)
}

// ---- Commands ------------------------------------------------------------------------------------

/// What is installed, without touching the network. Cheap enough to ask before every run.
#[tauri::command]
pub async fn acp_managed_status(app: AppHandle) -> Result<AcpManagedStatus, String> {
    let root = root_of(&app)?;
    tauri::async_runtime::spawn_blocking(move || status_in(&paths_in(&root)))
        .await
        .map_err(|e| e.to_string())
}

/// Installs whatever is missing, and answers with the status either way. Idempotent.
#[tauri::command]
pub async fn acp_managed_ensure(
    app: AppHandle,
    state: TauriState<'_, AcpSetupState>,
) -> Result<AcpManagedStatus, String> {
    let root = root_of(&app)?;
    let paths = paths_in(&root);

    // The cheap answer first, without taking the lock.
    let status = status_in(&paths);
    if status.runtime_ready && status.adapter_ready {
        return Ok(status);
    }

    let _guard = state.installing.lock().await;

    // Whoever held the lock may have just finished the very install this call was about to start.
    let status = status_in(&paths);
    if status.runtime_ready && status.adapter_ready {
        return Ok(status);
    }

    state.shared.cancelled.store(false, Ordering::SeqCst);
    let report = reporter(&app);
    let result = install(&report, &paths, &state.shared).await;
    state.shared.child.lock().unwrap_or_else(|e| e.into_inner()).take();

    match result {
        Ok(()) => {
            let status = status_in(&paths);
            say(&report, "ready", None, None, Some("ACP runtime ready".into()));
            Ok(status)
        }
        Err(e) => {
            say(&report, "error", None, None, Some(e.clone()));
            Err(e)
        }
    }
}

/// Stops an install in flight: the download gives up at its next chunk, and `bun install` is killed.
#[tauri::command]
pub async fn acp_managed_cancel(
    app: AppHandle,
    state: TauriState<'_, AcpSetupState>,
) -> Result<(), String> {
    state.shared.cancelled.store(true, Ordering::SeqCst);
    let pid = state.shared.child.lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some(pid) = pid {
        crate::runner::kill_tree(pid);
    }
    logging::append(&app, "info", "acp-setup", "setup cancelled");
    Ok(())
}

// ---- The install itself ----------------------------------------------------------------------------

async fn install(report: &Report, paths: &Paths, shared: &std::sync::Arc<Shared>) -> Result<(), String> {
    // Idempotent here and not only in the command: this is the function the tests drive, and
    // "already done" has to mean the same thing to both of them.
    let status = status_in(paths);
    if status.runtime_ready && status.adapter_ready {
        return Ok(());
    }
    if !paths.bun.is_file() {
        install_runtime(report, paths, shared).await?;
    }
    if cancelled(shared) {
        return Err("cancelled".into());
    }
    install_adapter(report, paths, shared).await
}

// ---- bun -------------------------------------------------------------------------------------------

/// Downloads bun, checks it, unpacks it, and makes sure the result actually runs here.
///
/// The Windows retry is why this is a loop and not three statements in a row: the default x64 build
/// needs AVX2, and on a processor without it bun does not fail to download or to unpack — it fails
/// the first time it is run. `windows-x64-baseline` is the build for those machines.
async fn install_runtime(report: &Report, paths: &Paths, shared: &std::sync::Arc<Shared>) -> Result<(), String> {
    let base = bun_target(std::env::consts::OS, std::env::consts::ARCH).ok_or_else(|| {
        format!(
            "bun publishes no build for {}-{}",
            std::env::consts::OS,
            std::env::consts::ARCH
        )
    })?;

    let targets: Vec<&str> = if base == "windows-x64" {
        vec!["windows-x64", "windows-x64-baseline"]
    } else {
        vec![base]
    };

    let sums = fetch_shasums(report).await?;
    let mut last_error = String::new();

    for (attempt, target) in targets.iter().enumerate() {
        if cancelled(shared) {
            return Err("cancelled".into());
        }
        if attempt > 0 {
            say(report,
                "runtime-download",
                None,
                None,
                Some(format!(
                    "bun {BUN_VERSION} did not start here ({last_error}); retrying with the {target} build"
                )),
            );
        }
        match fetch_and_unpack(report, paths, shared, target, &sums).await {
            Ok(version) => {
                say(report,
                    "runtime-extract",
                    None,
                    None,
                    Some(format!("bun {version} installed at {}", paths.bun.display())),
                );
                return Ok(());
            }
            Err(e) => {
                if cancelled(shared) {
                    return Err("cancelled".into());
                }
                last_error = e;
            }
        }
    }
    Err(last_error)
}

/// `SHASUMS256.txt` of the pinned release.
///
/// Fetched instead of hardcoded: six hashes in this file would be six more things to get right on
/// every bump, and the one thing they protect against — a tampered download — is covered just as
/// well by a checksum file served over TLS from the same release as the zip.
async fn fetch_shasums(report: &Report) -> Result<String, String> {
    let url =
        format!("https://github.com/oven-sh/bun/releases/download/bun-v{BUN_VERSION}/SHASUMS256.txt");
    say(report, "runtime-download", None, None, Some(format!("fetching {url}")));
    let res = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("could not fetch bun checksums: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("bun checksums answered {}", res.status()));
    }
    res.text().await.map_err(|e| e.to_string())
}

/// `<hash>  <file>` lines, of which we want exactly one.
fn parse_shasums(text: &str, file: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let (hash, name) = line.trim().split_once("  ")?;
        (name.trim() == file && !hash.is_empty()).then(|| hash.to_lowercase())
    })
}

async fn fetch_and_unpack(
    report: &Report,
    paths: &Paths,
    shared: &std::sync::Arc<Shared>,
    target: &str,
    sums: &str,
) -> Result<String, String> {
    let zip_name = format!("bun-{target}.zip");
    let expected = parse_shasums(sums, &zip_name)
        .ok_or_else(|| format!("{zip_name} is not listed in the bun {BUN_VERSION} checksums"))?;

    std::fs::create_dir_all(&paths.runtime_dir).map_err(|e| e.to_string())?;
    let archive = paths.runtime_dir.join(format!("{zip_name}.part"));

    let digest = download(report, shared, &zip_name, &archive).await?;
    if digest != expected {
        let _ = std::fs::remove_file(&archive);
        return Err(format!(
            "{zip_name} checksum mismatch: got {digest}, expected {expected}"
        ));
    }
    say(report, "runtime-verify", None, None, Some(format!("{zip_name} sha256 ok")));

    say(report, "runtime-extract", None, None, Some(format!("unpacking {zip_name}")));
    let (archive_c, bun_c, target_c) = (archive.clone(), paths.bun.clone(), target.to_string());
    tauri::async_runtime::spawn_blocking(move || unpack(&archive_c, &bun_c, &target_c))
        .await
        .map_err(|e| e.to_string())??;
    let _ = std::fs::remove_file(&archive);

    // The only thing that says this build runs on this processor.
    bun_version(&paths.bun)
}

/// Streams the zip to `dest`, hashing as it goes, and says what the sha256 was.
///
/// Never `bytes()`: a 50 MB response held whole in memory next to the file it is about to become is
/// a peak nobody needs. The progress event is throttled, because at 64 KB a chunk a 50 MB download
/// is hundreds of events and the window only ever draws one bar.
async fn download(
    report: &Report,
    shared: &std::sync::Arc<Shared>,
    zip_name: &str,
    dest: &Path,
) -> Result<String, String> {
    let url = format!("https://github.com/oven-sh/bun/releases/download/bun-v{BUN_VERSION}/{zip_name}");
    say(report, "runtime-download", Some(0), None, Some(format!("downloading {url}")));

    let mut res = reqwest::Client::builder()
        .timeout(Duration::from_secs(15 * 60))
        .build()
        .map_err(|e| e.to_string())?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("could not download {zip_name}: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("{zip_name} answered {}", res.status()));
    }
    let total = res.content_length();

    let mut file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut last_emit = std::time::Instant::now();
    let mut last_percent: u64 = 0;

    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        if cancelled(shared) {
            drop(file);
            let _ = std::fs::remove_file(dest);
            return Err("cancelled".into());
        }
        hasher.update(&chunk);
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        received += chunk.len() as u64;

        // One event per whole percent, and never two inside half a second — whichever is rarer.
        let percent = total.filter(|t| *t > 0).map(|t| received * 100 / t).unwrap_or(0);
        if percent > last_percent && last_emit.elapsed() >= Duration::from_millis(500) {
            last_percent = percent;
            last_emit = std::time::Instant::now();
            say(report, "runtime-download", Some(received), total, None);
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    say(report, "runtime-download", Some(received), total, None);

    Ok(format!("{:x}", hasher.finalize()))
}

/// Pulls the one file that matters out of the zip and puts it where `Paths` says.
///
/// The executable is inside a `bun-{target}/` folder in the archive. It is written beside its final
/// name and renamed at the end: a power cut halfway through must not leave a truncated `bun.exe`
/// that the next launch would take for an installed runtime.
fn unpack(archive: &Path, bun: &Path, target: &str) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let wanted_exe = format!("bun-{target}/bun.exe");
    let wanted_bin = format!("bun-{target}/bun");
    let index = (0..zip.len())
        .find(|i| {
            zip.by_index(*i)
                .map(|e| e.name() == wanted_exe || e.name() == wanted_bin)
                .unwrap_or(false)
        })
        .ok_or_else(|| format!("no bun executable inside bun-{target}.zip"))?;

    let temp = bun.with_extension("part");
    {
        let mut entry = zip.by_index(index).map_err(|e| e.to_string())?;
        let mut out = std::fs::File::create(&temp).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        out.flush().map_err(|e| e.to_string())?;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }

    // Windows refuses to rename over a file that is already there.
    let _ = std::fs::remove_file(bun);
    std::fs::rename(&temp, bun).map_err(|e| e.to_string())
}

/// `bun --version`, which is also the only check that this build runs on this processor.
fn bun_version(bun: &Path) -> Result<String, String> {
    let out = windowless(bun)
        .arg("--version")
        .output()
        .map_err(|e| format!("bun did not start: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "bun --version failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

// ---- The adapter -------------------------------------------------------------------------------------

async fn install_adapter(report: &Report, paths: &Paths, shared: &std::sync::Arc<Shared>) -> Result<(), String> {
    std::fs::create_dir_all(&paths.acp_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&paths.cache_dir).map_err(|e| e.to_string())?;

    let manifest = serde_json::json!({
        "name": "ainess-acp",
        "private": true,
        "dependencies": { ACP_ADAPTER_PACKAGE: ACP_ADAPTER_RANGE },
    });
    std::fs::write(
        &paths.package_json,
        serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    say(report,
        "adapter-install",
        None,
        None,
        Some(format!(
            "bun install {ACP_ADAPTER_PACKAGE}@{ACP_ADAPTER_RANGE} (about 280 MB)"
        )),
    );

    let (report_c, paths_c, shared_c) = (report.clone(), paths.clone(), shared.clone());
    tauri::async_runtime::spawn_blocking(move || run_bun_install(&report_c, &paths_c, &shared_c))
        .await
        .map_err(|e| e.to_string())??;

    // The engine is an optional dependency, and an optional dependency bun decided to skip is not
    // an error anywhere it would be noticed — until a run starts and the adapter has no Claude Code
    // to drive. Better to fail here, where there is still a progress screen to say it on.
    let engine = engine_path_in(&paths.node_modules, std::env::consts::OS, std::env::consts::ARCH)
        .ok_or_else(|| {
            format!(
                "the adapter installed but {} did not: no Claude Code engine under {}",
                engine_package(std::env::consts::OS, std::env::consts::ARCH)
                    .unwrap_or_else(|| "the engine package".into()),
                paths.node_modules.display()
            )
        })?;

    let version = adapter_version_in(&paths.node_modules);
    say(report,
        "adapter-install",
        None,
        None,
        Some(format!(
            "adapter {} installed; engine at {}",
            version.clone().unwrap_or_else(|| "?".into()),
            engine.display()
        )),
    );

    let marker = Marker {
        range: ACP_ADAPTER_RANGE.to_string(),
        adapter_version: version,
        bun_version: bun_version(&paths.bun).unwrap_or_else(|_| BUN_VERSION.to_string()),
        installed_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
    };
    // Last of all, and only now: the marker is what the next launch reads to decide it can skip all
    // of this, so it must not exist unless all of it worked.
    std::fs::write(
        &paths.marker,
        serde_json::to_string_pretty(&marker).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

/// Runs `bun install` in `acp/` and relays every line it prints.
fn run_bun_install(report: &Report, paths: &Paths, shared: &std::sync::Arc<Shared>) -> Result<(), String> {
    let mut child = windowless(&paths.bun)
        .arg("install")
        .current_dir(&paths.acp_dir)
        // bun's cache belongs to the app and not to the user's home: the app's folder is what an
        // uninstall takes with it, and bun hardlinks out of that cache, so the same volume matters.
        .env("BUN_INSTALL_CACHE_DIR", &paths.cache_dir)
        .env("NO_COLOR", "1")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not start bun install: {e}"))?;

    *shared.child.lock().unwrap_or_else(|e| e.into_inner()) = Some(child.id());

    let mut readers = Vec::new();
    for pipe in [
        child.stdout.take().map(Pipe::Out),
        child.stderr.take().map(Pipe::Err),
    ]
    .into_iter()
    .flatten()
    {
        let report = report.clone();
        readers.push(std::thread::spawn(move || {
            let reader: Box<dyn BufRead> = match pipe {
                Pipe::Out(o) => Box::new(BufReader::new(o)),
                Pipe::Err(e) => Box::new(BufReader::new(e)),
            };
            for line in reader.lines().map_while(Result::ok) {
                let line = line.trim_end();
                if !line.is_empty() {
                    say(&report, "adapter-install", None, None, Some(line.to_string()));
                }
            }
        }));
    }

    let deadline = std::time::Instant::now() + INSTALL_TIMEOUT;
    let status = loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => break status,
            None => {
                if cancelled(shared) {
                    crate::runner::kill_tree(child.id());
                    let _ = child.wait();
                    return Err("cancelled".into());
                }
                if std::time::Instant::now() > deadline {
                    crate::runner::kill_tree(child.id());
                    let _ = child.wait();
                    return Err(format!(
                        "bun install gave no sign of finishing in {} minutes",
                        INSTALL_TIMEOUT.as_secs() / 60
                    ));
                }
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    };
    for reader in readers {
        let _ = reader.join();
    }

    if !status.success() {
        return Err(format!("bun install exited with {}", status.code().unwrap_or(-1)));
    }
    Ok(())
}

enum Pipe {
    Out(std::process::ChildStdout),
    Err(std::process::ChildStderr),
}

/// A command that does not flash a console window: all of this runs behind a progress screen.
fn windowless(program: &Path) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

// ---- Tests ---------------------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_this_machine_to_a_bun_build() {
        assert_eq!(bun_target("windows", "x86_64"), Some("windows-x64"));
        assert_eq!(bun_target("macos", "aarch64"), Some("darwin-aarch64"));
        assert_eq!(bun_target("macos", "x86_64"), Some("darwin-x64"));
        assert_eq!(bun_target("linux", "x86_64"), Some("linux-x64"));
        assert_eq!(bun_target("linux", "aarch64"), Some("linux-aarch64"));
        // Nothing bun publishes a plain build for: the managed runtime stays unavailable there.
        assert_eq!(bun_target("windows", "x86"), None);
        assert_eq!(bun_target("freebsd", "x86_64"), None);
    }

    #[test]
    fn names_the_engine_package_the_way_npm_does() {
        assert_eq!(
            engine_package("windows", "x86_64").as_deref(),
            Some("@anthropic-ai/claude-agent-sdk-win32-x64")
        );
        assert_eq!(
            engine_package("macos", "aarch64").as_deref(),
            Some("@anthropic-ai/claude-agent-sdk-darwin-arm64")
        );
        assert_eq!(
            engine_package("linux", "x86_64").as_deref(),
            Some("@anthropic-ai/claude-agent-sdk-linux-x64")
        );
        assert_eq!(engine_package("plan9", "x86_64"), None);
    }

    #[test]
    fn reads_one_line_out_of_the_checksums() {
        let sums = concat!(
            "90987a3a16d7db556d886ac3d551e7b6d3edf0a1cf43acaed622e8676be1d12f  bun-darwin-aarch64.zip\n",
            "1111111111111111111111111111111111111111111111111111111111111111  bun-windows-x64-baseline.zip\n",
            "2222222222222222222222222222222222222222222222222222222222222222  bun-windows-x64.zip\n",
        );
        assert_eq!(
            parse_shasums(sums, "bun-windows-x64.zip").as_deref(),
            Some("2222222222222222222222222222222222222222222222222222222222222222")
        );
        // The baseline build is its own line and must not be reached by a prefix match.
        assert_eq!(
            parse_shasums(sums, "bun-windows-x64-baseline.zip").as_deref(),
            Some("1111111111111111111111111111111111111111111111111111111111111111")
        );
        assert_eq!(parse_shasums(sums, "bun-linux-x64.zip"), None);
        assert_eq!(parse_shasums("", "bun-windows-x64.zip"), None);
    }

    #[test]
    fn reinstalls_when_the_marker_does_not_answer_for_this_build() {
        let good = r#"{"range":"^0.81.2","adapterVersion":"0.81.2","bunVersion":"1.4.2","installedAt":1}"#;
        assert!(!needs_install(Some(good), true, "^0.81.2"));
        // The pin moved: what is on disk was installed for a range this build no longer asks for.
        assert!(needs_install(Some(good), true, "^0.82.0"));
        // Someone cleared node_modules and left the marker behind.
        assert!(needs_install(Some(good), false, "^0.81.2"));
        // The install was interrupted before the marker was written.
        assert!(needs_install(None, true, "^0.81.2"));
        assert!(needs_install(Some("{oops"), true, "^0.81.2"));
    }

    #[test]
    fn builds_every_path_under_one_root() {
        let root = Path::new("/data/ainess");
        let p = paths_in(root);
        assert_eq!(p.runtime_dir, root.join("runtime").join("bun"));
        assert_eq!(
            p.bun,
            p.runtime_dir.join(if cfg!(windows) { "bun.exe" } else { "bun" })
        );
        assert_eq!(p.acp_dir, root.join("acp"));
        assert_eq!(p.package_json, root.join("acp").join("package.json"));
        assert_eq!(p.node_modules, root.join("acp").join("node_modules"));
        assert_eq!(p.cache_dir, root.join("acp").join(".cache"));
        assert_eq!(p.marker, root.join("acp").join("installed.json"));
    }

    /// The whole install, for real, against a folder given on the command line.
    ///
    /// Ignored, and it has to be: it downloads bun from GitHub and ~280 MB of packages from npm,
    /// which is neither a unit test nor something to do in CI. It is here because it is the only
    /// thing that proves the module works — run it by hand with
    ///
    /// ```text
    /// AINESS_ACP_SETUP_DIR=/some/empty/folder cargo test --lib -- --ignored --nocapture
    /// ```
    ///
    /// and then check the handshake with `scripts/acp-managed-check.mjs`.
    #[test]
    #[ignore = "downloads ~330 MB; run by hand with AINESS_ACP_SETUP_DIR set"]
    fn installs_bun_and_the_adapter_for_real() {
        let root = PathBuf::from(
            std::env::var("AINESS_ACP_SETUP_DIR").expect("AINESS_ACP_SETUP_DIR must point at a folder"),
        );
        let paths = paths_in(&root);
        let shared = std::sync::Arc::new(Shared::default());
        let started = std::time::Instant::now();
        let report: Report = std::sync::Arc::new(|p: SetupProgress| {
            let detail = p.message.unwrap_or_else(|| match (p.received, p.total) {
                (Some(r), Some(t)) => format!("{r}/{t}"),
                (Some(r), None) => format!("{r}"),
                _ => String::new(),
            });
            println!("[{}] {detail}", p.phase);
        });

        tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(install(&report, &paths, &shared))
            .expect("the install must finish");

        let status = status_in(&paths);
        println!("installed in {:?}", started.elapsed());
        println!("{status:#?}");
        assert!(status.runtime_ready && status.adapter_ready);
        assert!(status.engine_path.is_some());
        assert!(paths.marker.is_file());

        // Second time round it must do nothing at all.
        let again = std::time::Instant::now();
        tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(install(&report, &paths, &shared))
            .expect("a second install must be a no-op");
        println!("second pass: {:?}", again.elapsed());
    }

    #[test]
    fn says_nothing_is_ready_in_an_empty_folder() {
        let root = std::env::temp_dir().join(format!("ainess-acp-empty-{}", std::process::id()));
        let status = status_in(&paths_in(&root));
        assert!(!status.runtime_ready);
        assert!(!status.adapter_ready);
        assert!(status.program.is_none());
        assert!(status.args.is_empty());
        assert!(status.engine_path.is_none());
        assert_eq!(status.install_dir, root.join("acp").to_string_lossy());
    }
}

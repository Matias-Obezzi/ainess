//! What is listening on a TCP port on this machine, and killing one of those processes.
//!
//! The reason this exists: a dev server an agent started is a grandchild or a great-grandchild of
//! the app, and when the run that launched it dies the process is reparented — it keeps the port
//! and nothing in the app can see it any more. Three runs left 3000, 3001 and 3002 taken with no
//! way to find out who had them.
//!
//! Nothing here kills on its own. `reap_orphans` in runner.rs decides by itself because it can
//! prove a process is the one a dead run started; here we cannot prove anything, so the list is
//! shown and the user chooses. That is also why attribution is a hint and never a filter.
//!
//! Attribution, in the order it is trusted:
//!   1. **cwd inside a project folder.** The one that survives reparenting, which is the case that
//!      broke: `npm run dev` runs with its cwd in the workspace whoever its parent is by now.
//!      sysinfo reads it in the same refresh that gives us the name, so it costs nothing extra —
//!      when Windows lets us read it at all. It does not for a process of another user or one
//!      running elevated, and then the row is simply unattributed.
//!   2. **This app is still an ancestor.** Free (the parent pid is already in the same snapshot)
//!      and exact while the chain holds, which is precisely when the problem is not happening.
//! Neither answers: the row still shows its port, its process and its command line, and the user
//! decides. Seeing and killing is the whole value; the label is a convenience.

use serde::Serialize;
#[cfg(windows)]
use std::process::{Command, Stdio};

/// A command line long enough to be a paragraph is an Electron or a JVM one, and the useful part
/// is at the front. Keeps a hundred rows from carrying a megabyte into the webview.
const MAX_COMMAND_CHARS: usize = 200;

/// How far up the parent chain to look before giving up. A chain longer than this is a cycle in a
/// snapshot taken while processes were dying, not a real ancestry.
const MAX_ANCESTRY_HOPS: usize = 16;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListeningPort {
    pub port: u16,
    pub pid: u32,
    /// Image name, `node.exe` and the like. Empty when the process went away between the two reads.
    pub name: String,
    /// The full command line, truncated. None when the OS would not give it.
    pub command: Option<String>,
    /// The project folder its cwd falls inside, when one does. The strongest attribution we have.
    pub project: Option<String>,
    /// Whether this app is still one of its ancestors.
    pub descendant: bool,
}

/// The `(port, pid)` of every listening TCP socket in `netstat -ano` output.
///
/// What marks a listening row is *not* the state word: that one is translated, and on a Spanish
/// Windows it reads `ESCUCHANDO`. The foreign address of a listening socket is `0.0.0.0:0` or
/// `[::]:0` in every locale, and no connected socket can have a foreign port of 0 — so that is what
/// is matched. UDP rows have no fifth column and fall out on the length check.
///
/// The same port shows up twice when something listens on both stacks (`0.0.0.0:3000` and
/// `[::]:3000`); the pair is returned once.
pub fn parse_netstat_listening(text: &str) -> Vec<(u16, u32)> {
    let mut out: Vec<(u16, u32)> = Vec::new();
    for line in text.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        // proto, local, foreign, state, pid.
        if fields.len() < 5 || !fields[0].eq_ignore_ascii_case("TCP") {
            continue;
        }
        if !fields[2].ends_with(":0") {
            continue;
        }
        let Some(port) = port_of(fields[1]) else { continue };
        let Ok(pid) = fields[fields.len() - 1].parse::<u32>() else { continue };
        // Pid 0 is the idle process: it holds reserved ports and cannot be killed.
        if pid == 0 {
            continue;
        }
        if !out.contains(&(port, pid)) {
            out.push((port, pid));
        }
    }
    out
}

/// The port of `0.0.0.0:3000`, `[::1]:3000` or `127.0.0.1:3000` — whatever follows the last colon.
fn port_of(address: &str) -> Option<u16> {
    address.rsplit(':').next()?.parse::<u16>().ok()
}

/// The root in `roots` that contains `cwd`, if any.
///
/// A prefix match alone would read `C:\dev\app2` as being inside `C:\dev\app`, so the character
/// after the root has to be a separator (or nothing at all, when cwd *is* the root). Case is
/// ignored on Windows, where `c:\dev` and `C:\Dev` are the same folder.
fn project_of<'a>(cwd: &str, roots: &'a [String]) -> Option<&'a str> {
    let norm = |s: &str| {
        let s = s.replace('/', "\\").trim_end_matches('\\').to_string();
        if cfg!(windows) { s.to_lowercase() } else { s }
    };
    let haystack = norm(cwd);
    // The deepest root wins, so a project nested inside another is not reported as the outer one.
    roots
        .iter()
        .filter(|root| {
            let r = norm(root.as_str());
            !r.is_empty()
                && haystack.starts_with(&r)
                && (haystack.len() == r.len() || haystack.as_bytes()[r.len()] == b'\\')
        })
        .max_by_key(|root| root.len())
        .map(|s| s.as_str())
}

/// A `netstat` that does not flash a console window on the user's screen, same reason and same
/// shape as the one in runner.rs and tunnel.rs.
#[cfg(windows)]
fn windowless(program: &str) -> Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut cmd = Command::new(program);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Raw `netstat -ano` output. Empty when it could not be run.
#[cfg(windows)]
fn netstat() -> String {
    match windowless("netstat")
        .args(["-ano"])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
    {
        Ok(out) => String::from_utf8_lossy(&out.stdout).to_string(),
        Err(_) => String::new(),
    }
}

/// ponytail: Windows only. `netstat -ano` is a Windows spelling; elsewhere this would be
/// `lsof -nP -iTCP -sTCP:LISTEN` with a parser of its own. Add it when the app ships for a second
/// platform — the desktop build is Windows today, and an empty list here reads as "no ports".
#[cfg(not(windows))]
fn netstat() -> String {
    String::new()
}

/// Every TCP port being listened on here, with whatever we can say about the process holding it.
///
/// `roots` are the workspace folders of the app's projects, passed in because the project list
/// lives in the frontend. Empty is fine: it only costs the cwd half of the attribution.
#[tauri::command]
pub async fn listening_ports(roots: Vec<String>) -> Vec<ListeningPort> {
    tauri::async_runtime::spawn_blocking(move || collect(&roots))
        .await
        .unwrap_or_default()
}

fn collect(roots: &[String]) -> Vec<ListeningPort> {
    let sockets = parse_netstat_listening(&netstat());
    if sockets.is_empty() {
        return Vec::new();
    }
    // One refresh for the whole list: the same full scan `reap_orphans` does, once, off the main
    // thread. Asking per pid would be the same work as many times as there are ports.
    let mut system = sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let me = std::process::id();

    sockets
        .into_iter()
        .map(|(port, pid)| {
            let process = system.process(sysinfo::Pid::from_u32(pid));
            let name = process
                .map(|p| p.name().to_string_lossy().into_owned())
                .unwrap_or_default();
            let command = process.and_then(|p| {
                let joined = p
                    .cmd()
                    .iter()
                    .map(|a| a.to_string_lossy())
                    .collect::<Vec<_>>()
                    .join(" ");
                if joined.trim().is_empty() {
                    None
                } else {
                    Some(truncate(&joined))
                }
            });
            let project = process
                .and_then(|p| p.cwd())
                .and_then(|cwd| project_of(&cwd.to_string_lossy(), roots))
                .map(|s| s.to_string());
            ListeningPort {
                port,
                pid,
                name,
                command,
                project,
                descendant: is_descendant(&system, pid, me),
            }
        })
        .collect()
}

fn truncate(text: &str) -> String {
    if text.chars().count() <= MAX_COMMAND_CHARS {
        return text.to_string();
    }
    text.chars().take(MAX_COMMAND_CHARS).collect::<String>() + "…"
}

/// Whether `ancestor` is somewhere up `pid`'s parent chain. Broken chains — the reparented case —
/// simply answer false.
fn is_descendant(system: &sysinfo::System, pid: u32, ancestor: u32) -> bool {
    let mut current = sysinfo::Pid::from_u32(pid);
    let target = sysinfo::Pid::from_u32(ancestor);
    for _ in 0..MAX_ANCESTRY_HOPS {
        let Some(parent) = system.process(current).and_then(|p| p.parent()) else {
            return false;
        };
        if parent == target {
            return true;
        }
        current = parent;
    }
    false
}

/// Kills the process holding a port, and everything under it.
///
/// The whole tree, because an `npm run dev` is a `cmd.exe` holding a `node.exe`: killing the one
/// the port is registered against would leave the actual server running, and killing the top one
/// alone would leave the port taken. Same `kill_tree` a run's stop button goes through.
#[tauri::command]
pub async fn kill_port_process(app: tauri::AppHandle, pid: u32) -> Result<(), String> {
    crate::logging::append(
        &app,
        "warn",
        "ports",
        &format!("killing pid {pid} at the user's request to free its port"),
    );
    tauri::async_runtime::spawn_blocking(move || crate::runner::kill_tree(pid))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::{parse_netstat_listening, port_of, project_of};

    /// Real `netstat -ano` output, header and all.
    const SAMPLE: &str = "\r
Conexiones activas\r
\r
  Proto  Dirección local        Dirección remota       Estado           PID\r
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       968\r
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       24680\r
  TCP    127.0.0.1:3001         0.0.0.0:0              LISTENING       13572\r
  TCP    127.0.0.1:52341        127.0.0.1:3000         ESTABLISHED     8120\r
  TCP    [::]:3000              [::]:0                 LISTENING       24680\r
  TCP    [::1]:3002             [::]:0                 LISTENING       9001\r
  UDP    0.0.0.0:5353           *:*                                    2504\r
";

    #[test]
    fn reads_the_listening_sockets() {
        assert_eq!(
            parse_netstat_listening(SAMPLE),
            vec![(135, 968), (3000, 24680), (3001, 13572), (3002, 9001)]
        );
    }

    #[test]
    fn the_same_port_on_both_stacks_is_one_row() {
        // `0.0.0.0:3000` and `[::]:3000` are the same server listening twice.
        let both = parse_netstat_listening(SAMPLE);
        assert_eq!(both.iter().filter(|(port, _)| *port == 3000).count(), 1);
    }

    #[test]
    fn a_translated_state_word_still_reads() {
        // A Spanish Windows writes ESCUCHANDO where an English one writes LISTENING: what is
        // matched is the `:0` foreign port, which no locale touches.
        let es = "  TCP    0.0.0.0:4173           0.0.0.0:0              ESCUCHANDO      7777";
        assert_eq!(parse_netstat_listening(es), vec![(4173, 7777)]);
    }

    #[test]
    fn skips_what_is_not_a_listening_tcp_row() {
        // Headers, blank lines, UDP, connected sockets and sockets on their way out.
        let noise = "\
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  UDP    0.0.0.0:500            *:*                                    1420
  TCP    127.0.0.1:49871        127.0.0.1:9229         TIME_WAIT       0
  TCP    192.168.0.10:139       0.0.0.0:0              LISTENING       4
";
        assert_eq!(parse_netstat_listening(noise), vec![(139, 4)]);
    }

    #[test]
    fn survives_garbage() {
        assert_eq!(parse_netstat_listening(""), vec![]);
        assert_eq!(parse_netstat_listening("   \n\t\n"), vec![]);
        // A truncated row, and one whose pid column is not a number.
        assert_eq!(parse_netstat_listening("  TCP    0.0.0.0:80"), vec![]);
        assert_eq!(
            parse_netstat_listening("  TCP    0.0.0.0:80   0.0.0.0:0   LISTENING   n/a"),
            vec![]
        );
        // Pid 0 holds reserved ports and cannot be killed: not worth showing.
        assert_eq!(
            parse_netstat_listening("  TCP    0.0.0.0:80   0.0.0.0:0   LISTENING   0"),
            vec![]
        );
        // A port outside the u16 range is not a port.
        assert_eq!(
            parse_netstat_listening("  TCP    0.0.0.0:99999   0.0.0.0:0   LISTENING   12"),
            vec![]
        );
    }

    #[test]
    fn reads_the_port_off_either_address_family() {
        assert_eq!(port_of("0.0.0.0:3000"), Some(3000));
        assert_eq!(port_of("[::]:3000"), Some(3000));
        assert_eq!(port_of("[fe80::1%17]:8080"), Some(8080));
        assert_eq!(port_of("0.0.0.0"), None);
    }

    #[test]
    fn attributes_a_process_working_inside_a_project() {
        let roots = vec![
            "C:\\dev\\ainess".to_string(),
            "C:\\dev\\ainess-wt-x".to_string(),
        ];
        assert_eq!(
            project_of("C:\\dev\\ainess\\src", &roots),
            Some("C:\\dev\\ainess")
        );
        // The folder itself, and the same path written the other way round.
        assert_eq!(project_of("C:/dev/ainess", &roots), Some("C:\\dev\\ainess"));
        assert_eq!(
            project_of("c:\\DEV\\Ainess\\e2e", &roots),
            if cfg!(windows) { Some("C:\\dev\\ainess") } else { None }
        );
    }

    #[test]
    fn a_sibling_folder_is_not_inside_the_project() {
        let roots = vec!["C:\\dev\\ainess".to_string()];
        // The bug a bare `starts_with` would have: a worktree next door is not the project.
        assert_eq!(project_of("C:\\dev\\ainess-wt-x\\src", &roots), None);
        assert_eq!(project_of("C:\\dev", &roots), None);
        assert_eq!(project_of("C:\\dev\\ainess", &[]), None);
        // An empty root would otherwise swallow every process on the machine.
        assert_eq!(project_of("C:\\dev\\ainess", &["".to_string()]), None);
    }

    #[test]
    fn the_nested_project_wins_over_the_one_around_it() {
        let roots = vec!["C:\\dev".to_string(), "C:\\dev\\ainess".to_string()];
        assert_eq!(
            project_of("C:\\dev\\ainess\\src", &roots),
            Some("C:\\dev\\ainess")
        );
    }
}

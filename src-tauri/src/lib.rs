mod acp_setup;
mod config;
mod console;
mod detect;
mod diagnostics;
mod editors;
mod http;
mod logging;
mod ports;
mod pty;
mod remote;
mod repo_watch;
mod runner;
mod tray;
mod tunnel;
mod webview;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Before the builder, and well before anything is spawned: every process started from here on
    // inherits this console instead of asking Windows for one of its own (see src/console.rs).
    console::share_console();

    let app = tauri::Builder::default()
        // First of all the plugins, as the plugin itself asks: a second launch has to be turned
        // back before anything else starts. Closing the window only hides it in the tray, so what
        // "already open" means is often an invisible window — hence the show before the focus.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            logging::append(app, "info", "app", "another instance tried to open: the one already running was focused");
        }))
        .manage(runner::RunnerState::default())
        .manage(acp_setup::AcpSetupState::default())
        .manage(remote::RemoteState::default())
        .manage(tray::TrayState::default())
        .manage(tunnel::TunnelState::default())
        .manage(repo_watch::RepoWatchState::default())
        .manage(logging::LogState::default())
        .manage(pty::PtyState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Size, position, maximized and fullscreen come back on the next launch; `tauri.conf.json`
        // only says how the very first one opens. Never visibility: closing the window hides it in
        // the tray, and a hidden window written down as hidden would come back that way. Never
        // decorations either: they are off by config, and the title bar is ours.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(tray::WINDOW_STATE_FLAGS)
                .build(),
        )
        .setup(|app| {
            let handle = app.handle().clone();
            // First thing in the setup, which is the first moment there is an `AppHandle` to log
            // with. `panic = "abort"` in the release profile means a panic kills the process on the
            // spot — no unwinding, no backtrace, nothing written anywhere — and that is why the two
            // crashes we have seen left no evidence at all. The hook still runs before the abort,
            // so from here on the log says what panicked and where.
            install_panic_logging(handle.clone());
            logging::prune_old(&handle);
            logging::append(
                &handle,
                "info",
                "app",
                &format!("ainess {} starting", handle.package_info().version),
            );
            // A tunnel outlives an app that was killed instead of closed, and ngrok only allows
            // one agent session per account: whatever the last session left behind goes now.
            tunnel::kill_orphan(&handle);
            // The window is a WebView2, and a WebView2 behaves like Edge until it is told not
            // to: Ctrl+J opens the downloads, F5 reloads, Ctrl+wheel zooms, two fingers on the
            // touchpad go back. All of that goes off here (see src/webview.rs).
            webview::tame_the_browser(&handle);
            Ok(())
        })
        .on_window_event(tray::on_window_event)
        .invoke_handler(tauri::generate_handler![
            runner::spawn_run,
            runner::reap_orphans,
            runner::kill_run,
            runner::write_stdin,
            runner::close_stdin,
            runner::running_runs,
            runner::exec_capture,
            config::load_config,
            config::save_config,
            config::write_config_file,
            config::read_config_file,
            config::delete_config_file,
            config::read_home_file,
            config::read_file_abs,
            config::files_exist_abs,
            config::write_file_abs,
            config::write_file_bytes,
            detect::detect_binaries,
            detect::which_program,
            editors::detect_editors,
            editors::open_in_editor,
            config::list_subdirs,
            diagnostics::storage_stat,
            diagnostics::port_available,
            ports::listening_ports,
            ports::kill_port_process,
            http::http_post,
            http::http_patch,
            http::http_put,
            http::http_get,
            logging::log_append,
            logging::logs_dir,
            logging::open_logs_dir,
            logging::read_recent_logs,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_list_shells,
            remote::remote_start,
            remote::remote_stop,
            remote::remote_status,
            remote::remote_push_state,
            remote::remote_reply,
            tray::set_tray_enabled,
            tray::tray_configure,
            tray::request_attention,
            tunnel::tunnel_start,
            tunnel::tunnel_stop,
            tunnel::tunnel_status,
            tunnel::tunnel_detect,
            repo_watch::repo_watch_start,
            repo_watch::repo_watch_stop,
            acp_setup::acp_managed_status,
            acp_setup::acp_managed_ensure,
            acp_setup::acp_managed_cancel
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    // Quitting from the tray or closing the last window must not leave the tunnel process alive.
    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            runner::shutdown(handle);
            tunnel::shutdown(handle);
            repo_watch::shutdown(handle);
            pty::shutdown(handle);
            logging::append(handle, "info", "app", "ainess shutting down");
        }
    });
}

/// Writes every panic to the log file before the process goes.
///
/// The default hook stays underneath — it is what prints the panic to the console, which is still
/// the fastest way to read one while developing. This only adds the line to the file: the payload
/// (the message the panic was raised with), where it was raised, and which thread was in it, since
/// most of what this app does happens off the main one.
fn install_panic_logging(handle: tauri::AppHandle) {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| (*s).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<no message>".to_string());
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<unknown location>".to_string());
        let thread = std::thread::current();
        let name = thread.name().unwrap_or("<unnamed>").to_string();
        logging::append(
            &handle,
            "error",
            "panic",
            &format!("panic in thread '{name}' at {location}: {payload}"),
        );
        default_hook(info);
    }));
}

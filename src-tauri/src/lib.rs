mod config;
mod detect;
mod diagnostics;
mod http;
mod logging;
mod pty;
mod remote;
mod repo_watch;
mod runner;
mod tray;
mod tunnel;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
            logging::append(app, "info", "app", "otra instancia quiso abrirse: se enfocó la que ya estaba");
        }))
        .manage(runner::RunnerState::default())
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
        .setup(|app| {
            let handle = app.handle().clone();
            logging::prune_old(&handle);
            logging::append(
                &handle,
                "info",
                "app",
                &format!("ainess {} iniciando", handle.package_info().version),
            );
            tray::setup_tray(app)?;
            // A tunnel outlives an app that was killed instead of closed, and ngrok only allows
            // one agent session per account: whatever the last session left behind goes now.
            tunnel::kill_orphan(&handle);
            Ok(())
        })
        .on_window_event(tray::on_window_event)
        .invoke_handler(tauri::generate_handler![
            runner::spawn_run,
            runner::kill_run,
            runner::running_runs,
            runner::exec_capture,
            config::load_config,
            config::save_config,
            config::write_config_file,
            config::read_config_file,
            config::read_home_file,
            config::read_file_abs,
            detect::detect_binaries,
            diagnostics::storage_stat,
            diagnostics::port_available,
            http::http_post,
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
            tunnel::tunnel_start,
            tunnel::tunnel_stop,
            tunnel::tunnel_status,
            tunnel::tunnel_detect,
            repo_watch::repo_watch_start,
            repo_watch::repo_watch_stop
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
            logging::append(handle, "info", "app", "ainess cerrando");
        }
    });
}

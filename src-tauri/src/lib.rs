mod config;
mod detect;
mod diagnostics;
mod http;
mod logging;
mod pty;
mod remote;
mod runner;
mod tray;
mod tunnel;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(runner::RunnerState::default())
        .manage(remote::RemoteState::default())
        .manage(tray::TrayState::default())
        .manage(tunnel::TunnelState::default())
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
            tunnel::tunnel_detect
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    // Quitting from the tray or closing the last window must not leave the tunnel process alive.
    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            runner::shutdown(handle);
            tunnel::shutdown(handle);
            pty::shutdown(handle);
            logging::append(handle, "info", "app", "ainess cerrando");
        }
    });
}

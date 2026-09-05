mod config;
mod detect;
mod runner;
mod http;
mod remote;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(runner::RunnerState::default())
        .manage(remote::RemoteState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            detect::detect_binaries,
            http::http_post,
            http::http_get,
            remote::remote_start,
            remote::remote_stop,
            remote::remote_status,
            remote::remote_push_state,
            remote::remote_reply
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

mod config;
mod detect;
mod runner;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(runner::RunnerState::default())
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
            detect::detect_binaries
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

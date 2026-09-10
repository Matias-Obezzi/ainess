use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State,
};

/// Whether closing the main window should hide it to the tray instead of quitting.
/// Defaults to `true`: the app stays in the background unless the user turns it off.
pub struct TrayState {
    pub enabled: AtomicBool,
}

impl Default for TrayState {
    fn default() -> Self {
        Self { enabled: AtomicBool::new(true) }
    }
}

#[tauri::command]
pub fn set_tray_enabled(state: State<TrayState>, enabled: bool) {
    state.enabled.store(enabled, Ordering::Relaxed);
}

/// Flashes the window's taskbar button, and only while the window is not the one in front.
///
/// The focus check is here rather than in the caller so there is nothing to race: asking the
/// webview whether it has focus and then asking to flash are two trips, and the user can click on
/// the window in between — which would flash the window they are already looking at.
///
/// `Critical` rather than `Informational` because it keeps flashing until the window is focused,
/// and the thing being announced is a question that stays unanswered until somebody comes back.
#[tauri::command]
pub fn request_attention(app: AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    // Unreadable focus is treated as focused: a taskbar button flashing at somebody already looking
    // at the window is worse than one that stays still.
    if window.is_focused().unwrap_or(true) {
        return;
    }
    let _ = window.request_user_attention(Some(tauri::UserAttentionType::Critical));
}

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Mostrar AIS", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("AIS - Orquestador de agentes")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                crate::logging::append(app, "debug", "tray", "mostrar ventana desde la bandeja");
                show_main_window(app);
            }
            "quit" => {
                crate::logging::append(app, "info", "tray", "salir desde la bandeja");
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Closing the window hides it to the tray instead of quitting, unless the user disabled it.
pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let state = window.state::<TrayState>();
        if state.enabled.load(Ordering::Relaxed) {
            api.prevent_close();
            let _ = window.hide();
            crate::logging::append(window.app_handle(), "debug", "tray", "ventana oculta en la bandeja");
        }
    }
}

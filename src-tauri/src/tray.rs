use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, Wry,
};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// What the window remembers between launches: where it was and how big, maximized, fullscreen.
/// Not whether it was visible (see `lib.rs`), and not its decorations (there are none).
pub const WINDOW_STATE_FLAGS: StateFlags = StateFlags::all()
    .difference(StateFlags::VISIBLE)
    .difference(StateFlags::DECORATIONS);

/// The tray's menu items and icon, kept so their words can be changed after they are built.
struct TrayHandles {
    show: MenuItem<Wry>,
    quit: MenuItem<Wry>,
    icon: TrayIcon<Wry>,
}

/// Whether closing the main window should hide it to the tray instead of quitting.
/// Defaults to `true`: the app stays in the background unless the user turns it off.
pub struct TrayState {
    pub enabled: AtomicBool,
    /// None until the webview has said what the menu should read (`tray_configure`).
    handles: Mutex<Option<TrayHandles>>,
}

impl Default for TrayState {
    fn default() -> Self {
        Self { enabled: AtomicBool::new(true), handles: Mutex::new(None) }
    }
}

#[tauri::command]
pub fn set_tray_enabled(state: State<TrayState>, enabled: bool) {
    state.enabled.store(enabled, Ordering::Relaxed);
}

/// The words on the tray menu, in the language the app is showing. Sent by the webview when it
/// starts and again when the language changes.
#[derive(serde::Deserialize)]
pub struct TrayLabels {
    pub show: String,
    pub quit: String,
    pub tooltip: String,
}

/// Builds the tray the first time it is called, and relabels it every time after. The words are
/// not written here because there is nothing here that knows the user's language: every sentence
/// the user reads comes from the dictionaries in `src/i18n`, and these are no exception.
#[tauri::command]
pub fn tray_configure(app: AppHandle, state: State<TrayState>, labels: TrayLabels) -> Result<(), String> {
    let mut guard = state.handles.lock().map_err(|e| e.to_string())?;
    if let Some(handles) = guard.as_ref() {
        handles.show.set_text(&labels.show).map_err(|e| e.to_string())?;
        handles.quit.set_text(&labels.quit).map_err(|e| e.to_string())?;
        handles.icon.set_tooltip(Some(&labels.tooltip)).map_err(|e| e.to_string())?;
        return Ok(());
    }
    *guard = Some(build_tray(&app, &labels).map_err(|e| e.to_string())?);
    Ok(())
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

fn build_tray(app: &AppHandle, labels: &TrayLabels) -> tauri::Result<TrayHandles> {
    let show = MenuItem::with_id(app, "show", &labels.show, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", &labels.quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let icon = TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().ok_or(tauri::Error::WindowNotFound)?)
        .tooltip(&labels.tooltip)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                crate::logging::append(app, "debug", "tray", "show window from the tray");
                show_main_window(app);
            }
            "quit" => {
                crate::logging::append(app, "info", "tray", "quit from the tray");
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

    Ok(TrayHandles { show, quit, icon })
}

/// Closing the window hides it to the tray instead of quitting, unless the user disabled it — or
/// there is no tray yet to find it in again, which is the case until the webview has configured
/// one. A window hidden with no way back is an app that has to be killed from the task manager.
pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let state = window.state::<TrayState>();
        let has_tray = state.handles.lock().map(|h| h.is_some()).unwrap_or(false);
        if has_tray && state.enabled.load(Ordering::Relaxed) {
            api.prevent_close();
            // Written down now, while the window is still there to be measured: the plugin saves
            // on exit, and by then the window may have been hidden for hours. A hidden window
            // still answers, but this is the moment its state is known to be the user's.
            let _ = window.app_handle().save_window_state(WINDOW_STATE_FLAGS);
            let _ = window.hide();
            crate::logging::append(window.app_handle(), "debug", "tray", "window hidden in the tray");
        }
    }
}

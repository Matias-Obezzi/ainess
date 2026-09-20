//! The window is a WebView2, and WebView2 answers the browser's own accelerator keys itself,
//! before the page ever sees them: Ctrl+J drops Edge's download list on top of the app, Ctrl+P
//! opens a print dialog for it, F5 and Ctrl+R reload it, F12 opens the browser devtools. A
//! `keydown` listener in the page cannot cancel any of that, because the page is not asked.
//!
//! `AreBrowserAcceleratorKeysEnabled` is the setting Microsoft documents for exactly this case:
//! turning it off drops the browser's handling of Ctrl+F, F3, Ctrl+P, Ctrl+R, F5, Ctrl+Plus,
//! Ctrl+Minus, F12, Ctrl+Shift+C and the browser hardware keys (Back, Forward, Search). It does
//! not touch the keys for moving and editing text — Home, End, Page Up, Page Down, Ctrl+X, Ctrl+C,
//! Ctrl+V, Ctrl+A and Ctrl+Z all stay as they are — and it does not stop the key press from
//! reaching the page, so our own shortcuts (Ctrl+K, Ctrl+F, Ctrl+B, Ctrl+, and Ctrl+/) keep being
//! resolved by `src/lib/shortcuts.ts`. The one thing it takes away that is not a nuisance is
//! zooming with Ctrl+Plus and Ctrl+Minus; Ctrl+mouse wheel belongs to `IsZoomControlEnabled`,
//! which is left alone.
//!
//! WebView2 only exists on Windows, so everywhere else this is a no-op.

/// Stops the browser shortcuts from reaching the window. Best effort: if the WebView2 runtime is
/// too old to know the setting, the app opens all the same and the log says why.
#[cfg(windows)]
pub fn disable_browser_shortcuts(app: &tauri::AppHandle) {
    use crate::logging;
    use tauri::Manager;

    let Some(window) = app.get_webview_window("main") else { return };
    let handle = app.clone();
    let dispatched = window.with_webview(move |webview| {
        // SAFETY: every WebView2 COM call has to happen on the thread that owns the webview, and
        // that is the thread `with_webview` hands the controller over on.
        let applied = unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
            use windows_core::Interface;

            webview
                .controller()
                .CoreWebView2()
                .and_then(|core| core.Settings())
                .and_then(|settings| settings.cast::<ICoreWebView2Settings3>())
                .and_then(|settings| settings.SetAreBrowserAcceleratorKeysEnabled(false))
        };
        match applied {
            Ok(()) => logging::append(&handle, "info", "app", "browser accelerator keys disabled"),
            Err(error) => logging::append(
                &handle,
                "warn",
                "app",
                &format!("could not disable the browser accelerator keys: {error}"),
            ),
        }
    });
    if let Err(error) = dispatched {
        logging::append(
            app,
            "warn",
            "app",
            &format!("could not reach the webview to disable the browser accelerator keys: {error}"),
        );
    }
}

#[cfg(not(windows))]
pub fn disable_browser_shortcuts(_app: &tauri::AppHandle) {}

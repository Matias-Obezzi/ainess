//! The window is a WebView2, and a WebView2 out of the box behaves like Edge: it answers the
//! browser's own accelerator keys before the page ever sees them, it zooms with Ctrl+wheel, it
//! shows the URL of a link in a bar at the bottom left, it goes back when two fingers swipe left
//! on the touchpad, and it offers to remember what you type in a field. None of that belongs in an
//! app window, and none of it can be cancelled from the page: the page is not asked.
//!
//! Everything here is one setting on `ICoreWebView2Settings`. What is turned off, and why:
//!
//! - `AreBrowserAcceleratorKeysEnabled` — Ctrl+J drops Edge's download list on top of the app,
//!   Ctrl+P opens a print dialog, F5 and Ctrl+R reload, F12 opens the devtools. Turning it off
//!   also drops Ctrl+F, F3, Ctrl+Shift+C and the browser hardware keys (Back, Forward, Search). It
//!   does not touch the keys for moving and editing text — Home, End, Page Up, Page Down, Ctrl+X,
//!   Ctrl+C, Ctrl+V, Ctrl+A and Ctrl+Z all stay as they are — and it does not stop the key press
//!   from reaching the page, so our own shortcuts keep being resolved by `src/lib/shortcuts.ts`.
//! - `IsZoomControlEnabled` — Ctrl+wheel zooming the whole window. A desktop app has one size for
//!   its text and it is the one in the settings, not one a scroll can nudge by accident.
//! - `IsPinchZoomEnabled` — the same gesture with two fingers on the touchpad.
//! - `IsSwipeNavigationEnabled` — two fingers left on the touchpad navigates back. There is no
//!   back here: the history has one entry, so the gesture is only ever an accident.
//! - `IsStatusBarEnabled` — the little URL card at the bottom left when the pointer is over a
//!   link. Every link in the app opens outside it (`src/lib/open-external.ts`), so the card says
//!   the address of a page that is never going to load in this window.
//! - `IsGeneralAutofillEnabled` and `IsPasswordAutosaveEnabled` — Edge's own autofill dropdown and
//!   its "save this password?" bar, over fields that are paths, model names and API keys.
//!
//! What is deliberately left on:
//!
//! - `AreDefaultContextMenusEnabled`. The browser menu is already gone everywhere it is out of
//!   place: `src/hooks/useNoDefaultContextMenu.ts` swallows the event except over text fields and
//!   the terminals. Turning the setting off would take it away there too, and in a text field that
//!   native menu is the only way to paste with the mouse — the app has no menu of its own to put
//!   in its place. It goes off the day the fields have one.
//!
//! WebView2 only exists on Windows, so everywhere else this is a no-op.

/// Turns off what the WebView2 does as a browser rather than as a window. Best effort, one setting
/// at a time: each one lives on a different version of the settings interface, so on a runtime too
/// old for one of them the rest still apply and the log says which was missed.
#[cfg(windows)]
pub fn tame_the_browser(app: &tauri::AppHandle) {
    use crate::logging;
    use tauri::Manager;

    let Some(window) = app.get_webview_window("main") else { return };
    let handle = app.clone();
    let dispatched = window.with_webview(move |webview| {
        // SAFETY: every WebView2 COM call has to happen on the thread that owns the webview, and
        // that is the thread `with_webview` hands the controller over on.
        unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::{
                ICoreWebView2Settings3, ICoreWebView2Settings4, ICoreWebView2Settings5,
                ICoreWebView2Settings6,
            };
            use windows_core::Interface;

            let settings = match webview
                .controller()
                .CoreWebView2()
                .and_then(|core| core.Settings())
            {
                Ok(settings) => settings,
                Err(error) => {
                    logging::append(
                        &handle,
                        "warn",
                        "app",
                        &format!("could not reach the webview settings: {error}"),
                    );
                    return;
                }
            };

            report(
                &handle,
                "browser accelerator keys",
                settings
                    .cast::<ICoreWebView2Settings3>()
                    .and_then(|s| s.SetAreBrowserAcceleratorKeysEnabled(false)),
            );
            report(&handle, "zoom control", settings.SetIsZoomControlEnabled(false));
            report(&handle, "the status bar", settings.SetIsStatusBarEnabled(false));
            report(
                &handle,
                "pinch zoom",
                settings
                    .cast::<ICoreWebView2Settings5>()
                    .and_then(|s| s.SetIsPinchZoomEnabled(false)),
            );
            report(
                &handle,
                "swipe navigation",
                settings
                    .cast::<ICoreWebView2Settings6>()
                    .and_then(|s| s.SetIsSwipeNavigationEnabled(false)),
            );
            report(
                &handle,
                "autofill",
                settings.cast::<ICoreWebView2Settings4>().and_then(|s| {
                    s.SetIsGeneralAutofillEnabled(false)?;
                    s.SetIsPasswordAutosaveEnabled(false)
                }),
            );
        }
    });
    if let Err(error) = dispatched {
        logging::append(
            app,
            "warn",
            "app",
            &format!("could not reach the webview to turn off its browser behaviour: {error}"),
        );
    }
}

/// One line per setting: what it was, and why it could not be applied when it could not.
#[cfg(windows)]
fn report(app: &tauri::AppHandle, what: &str, applied: windows_core::Result<()>) {
    match applied {
        Ok(()) => crate::logging::append(app, "info", "app", &format!("webview: {what} disabled")),
        Err(error) => crate::logging::append(
            app,
            "warn",
            "app",
            &format!("webview: could not disable {what}: {error}"),
        ),
    }
}

#[cfg(not(windows))]
pub fn tame_the_browser(_app: &tauri::AppHandle) {}

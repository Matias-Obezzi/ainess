//! One hidden console for the whole app, so nothing below it ever pops one of its own.
//!
//! `CREATE_NO_WINDOW` leaves a process with no console at all. That is fine for the process we
//! start — but a console program it starts in turn asks Windows for a console, gets a brand new
//! one, and that one is visible. So an agent CLI running `git`, `node` or a language server threw
//! a black rectangle on screen for each of them, and the flag we had passed could do nothing about
//! it: the windows were never ours, they belonged to our grandchildren.
//!
//! A console is inherited, though, and inheritance goes all the way down. So the app takes one
//! console for itself at startup, hides it, and everything it spawns inherits that one instead of
//! asking for its own. Nothing pops, at any depth.
//!
//! Nothing is read from or written to it: what an agent says still comes back through the pipes
//! `runner.rs` sets up, exactly as before.

use std::sync::atomic::{AtomicBool, Ordering};

/// Whether spawned processes have a console to inherit — see `share_console`.
static SHARED: AtomicBool = AtomicBool::new(false);

/// True when a child can be started with no creation flags and be certain not to show a window.
pub fn is_shared() -> bool {
    SHARED.load(Ordering::Relaxed)
}

/// Takes a console for this process and hides it. Call once, before anything is spawned.
#[cfg(windows)]
pub fn share_console() {
    use windows_sys::Win32::System::Console::{AllocConsole, GetConsoleWindow};
    use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE};

    // SAFETY: three calls with no arguments to hand over and no memory to keep. `AllocConsole`
    // fails when this process already has one, which is the debug build with its dev console —
    // there is nothing to do then, and its console is the one children will inherit anyway.
    unsafe {
        let allocated = AllocConsole() != 0;
        // `HWND` is a bare `isize` here, and zero is the "there is none" it uses.
        let window = GetConsoleWindow();
        if window == 0 {
            return;
        }
        if allocated {
            ShowWindow(window, SW_HIDE);
        }
        SHARED.store(true, Ordering::Relaxed);
    }
}

#[cfg(not(windows))]
pub fn share_console() {
    // Nothing to do: no other platform hands out a window for being a console program.
}

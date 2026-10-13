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

    if alloc_console_without_window() {
        SHARED.store(true, Ordering::Relaxed);
        return;
    }

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

/// A console with no window at all (`AllocConsoleWithOptions`, Windows 11 24H2 and later).
///
/// `AllocConsole` + `SW_HIDE` is not enough where Windows Terminal is the default console host, as
/// it is out of the box on Windows 11: the console then lives in a Terminal window of its own that
/// `ShowWindow` never reaches, and the first agent that draws to it brings it up on screen. Looked
/// up at run time so older Windows, which lacks the function, falls back to hiding.
#[cfg(windows)]
fn alloc_console_without_window() -> bool {
    use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};

    #[repr(C)]
    struct AllocConsoleOptions {
        mode: i32,
        use_show_window: i32,
        show_window: u16,
    }
    const ALLOC_CONSOLE_MODE_NO_WINDOW: i32 = 2;
    const ALLOC_CONSOLE_RESULT_NEW_CONSOLE: i32 = 1;
    type AllocConsoleWithOptions = unsafe extern "system" fn(*const AllocConsoleOptions, *mut i32) -> i32;

    let kernel32: Vec<u16> = "kernel32.dll\0".encode_utf16().collect();
    // SAFETY: kernel32 is loaded in every process; the pointer, when there is one, is the function
    // with the signature documented for it, called with a struct laid out as the C one.
    unsafe {
        let module = GetModuleHandleW(kernel32.as_ptr());
        if module == 0 {
            return false;
        }
        let Some(proc) = GetProcAddress(module, b"AllocConsoleWithOptions\0".as_ptr()) else {
            return false;
        };
        let alloc: AllocConsoleWithOptions = std::mem::transmute(proc);
        let options = AllocConsoleOptions { mode: ALLOC_CONSOLE_MODE_NO_WINDOW, use_show_window: 0, show_window: 0 };
        let mut result = 0;
        alloc(&options, &mut result) >= 0 && result == ALLOC_CONSOLE_RESULT_NEW_CONSOLE
    }
}

#[cfg(not(windows))]
pub fn share_console() {
    // Nothing to do: no other platform hands out a window for being a console program.
}

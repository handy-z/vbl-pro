use crate::config::{SkillMode, StateKey};
use crate::state::AppState;
use once_cell::sync::Lazy;
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::AppHandle;
use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    MapVirtualKeyW, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT,
    KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MAPVK_VK_TO_VSC_EX,
    MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEINPUT, VK_BACK, VK_CAPITAL, VK_DELETE, VK_DOWN,
    VK_END, VK_ESCAPE, VK_F1, VK_F10, VK_F11, VK_F12, VK_F2, VK_F3, VK_F4, VK_F5, VK_F6, VK_F7,
    VK_F8, VK_F9, VK_HOME, VK_INSERT, VK_LCONTROL, VK_LEFT, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_NEXT,
    VK_NUMLOCK, VK_PRIOR, VK_RCONTROL, VK_RETURN, VK_RIGHT, VK_RMENU, VK_RSHIFT, VK_RWIN,
    VK_SCROLL, VK_SPACE, VK_TAB, VK_UP,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PeekMessageW, PostThreadMessageW,
    SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT,
    PM_NOREMOVE, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN,
    WM_SYSKEYUP, WM_XBUTTONDOWN, WM_XBUTTONUP,
};

struct InputContext {
    state: AppState,
    app: AppHandle,
}

unsafe impl Send for InputContext {}

static CONTEXT: Lazy<Mutex<Option<InputContext>>> = Lazy::new(|| Mutex::new(None));
static X2_STOP: AtomicBool = AtomicBool::new(false);
static X2_RUNNING: AtomicBool = AtomicBool::new(false);

pub fn start_hook(state: AppState, app: AppHandle) {
    if state
        .runtime()
        .input_hook_running
        .swap(true, Ordering::SeqCst)
    {
        return;
    }

    if let Ok(mut guard) = CONTEXT.lock() {
        *guard = Some(InputContext {
            state: state.clone(),
            app: app.clone(),
        });
    } else {
        state
            .runtime()
            .input_hook_running
            .store(false, Ordering::SeqCst);
        state.runtime().push_error(&app, "Input hook lock failed");
        return;
    }

    let thread_state = state.clone();
    let thread_app = app.clone();
    let thread = thread::Builder::new()
        .name("vbl-pro-input-hook".to_string())
        .spawn(move || unsafe {
            let mut message: MSG = std::mem::zeroed();
            PeekMessageW(&mut message, null_mut(), 0, 0, PM_NOREMOVE);
            thread_state.runtime().input_thread_id.store(
                windows_sys::Win32::System::Threading::GetCurrentThreadId(),
                Ordering::SeqCst,
            );

            let keyboard_hook =
                SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), null_mut(), 0);
            let mouse_hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), null_mut(), 0);

            if keyboard_hook.is_null() || mouse_hook.is_null() {
                if !keyboard_hook.is_null() {
                    UnhookWindowsHookEx(keyboard_hook);
                }
                if !mouse_hook.is_null() {
                    UnhookWindowsHookEx(mouse_hook);
                }
                thread_state
                    .runtime()
                    .input_thread_id
                    .store(0, Ordering::SeqCst);
                thread_state
                    .runtime()
                    .input_hook_running
                    .store(false, Ordering::SeqCst);
                if let Ok(mut guard) = CONTEXT.lock() {
                    *guard = None;
                }
                thread_state
                    .runtime()
                    .push_error(&thread_app, "Failed to start input hook");
                return;
            }

            thread_state
                .runtime()
                .push_log(&thread_app, "Input hook started");

            while thread_state
                .runtime()
                .runtime_enabled
                .load(Ordering::SeqCst)
                && GetMessageW(&mut message, null_mut(), 0, 0) > 0
            {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }

            UnhookWindowsHookEx(keyboard_hook);
            UnhookWindowsHookEx(mouse_hook);
            thread_state
                .runtime()
                .input_thread_id
                .store(0, Ordering::SeqCst);
            thread_state
                .runtime()
                .input_hook_running
                .store(false, Ordering::SeqCst);
            thread_state
                .runtime()
                .set_state(StateKey::X1Held, false, &thread_app);
            thread_state
                .runtime()
                .set_state(StateKey::X2Held, false, &thread_app);
            key_up("e");
            if let Ok(mut guard) = CONTEXT.lock() {
                *guard = None;
            }
            thread_state.runtime().emit_status(&thread_app);
        });

    if let Err(err) = thread {
        state
            .runtime()
            .input_hook_running
            .store(false, Ordering::SeqCst);
        state
            .runtime()
            .push_error(&app, format!("Failed to spawn input hook: {err}"));
    }
}

pub fn stop_hook(state: &AppState) {
    let thread_id = state.runtime().input_thread_id.load(Ordering::SeqCst);
    if thread_id != 0 {
        unsafe {
            PostThreadMessageW(thread_id, WM_QUIT, 0, 0);
        }
    }
}

pub fn start_x2_loop(state: AppState, app: AppHandle) {
    if X2_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    X2_STOP.store(false, Ordering::SeqCst);

    let thread_state = state.clone();
    let thread_app = app.clone();
    let thread = thread::Builder::new()
        .name("vbl-pro-x2-loop".to_string())
        .spawn(move || {
            while !X2_STOP.load(Ordering::SeqCst)
                && thread_state
                    .runtime()
                    .runtime_enabled
                    .load(Ordering::SeqCst)
            {
                let x2_held = thread_state.runtime().state(StateKey::X2Held);
                let game_on_ground = thread_state.runtime().state(StateKey::GameOnGround);
                let focused = thread_state.runtime().state(StateKey::RobloxFocused);

                if focused && x2_held && game_on_ground {
                    let skill_enabled = thread_state.runtime().state(StateKey::SkillEnabled);
                    let skill_ready = thread_state.runtime().state(StateKey::GameSkillReady);
                    let boomjump = thread_state
                        .config()
                        .map(|config| config.skill == SkillMode::Boomjump)
                        .unwrap_or(false);

                    if skill_enabled && skill_ready && boomjump {
                        tap("shift", 35);
                        tap("ctrl", 35);
                        thread::sleep(Duration::from_millis(25));
                        tap("shift", 35);
                    } else {
                        tap("shift", 35);
                        tap("space", 35);
                        tap("shift", 35);
                    }
                }

                thread::sleep(Duration::from_millis(1));
            }
            X2_RUNNING.store(false, Ordering::SeqCst);
            thread_state.runtime().emit_status(&thread_app);
        });

    if let Err(err) = thread {
        X2_RUNNING.store(false, Ordering::SeqCst);
        state
            .runtime()
            .push_error(&app, format!("Failed to spawn X2 loop: {err}"));
    }
}

pub fn stop_x2_loop() {
    X2_STOP.store(true, Ordering::SeqCst);
}

unsafe extern "system" fn keyboard_proc(ncode: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if ncode >= 0 {
        let data = *(lparam as *const KBDLLHOOKSTRUCT);
        let down = matches!(wparam as u32, WM_KEYDOWN | WM_SYSKEYDOWN);
        let up = matches!(wparam as u32, WM_KEYUP | WM_SYSKEYUP);
        if down || up {
            handle_keyboard(data.vkCode, down);
        }
    }
    CallNextHookEx(null_mut(), ncode, wparam, lparam)
}

unsafe extern "system" fn mouse_proc(ncode: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if ncode >= 0 {
        let data = *(lparam as *const MSLLHOOKSTRUCT);
        let message = wparam as u32;
        if message == WM_XBUTTONDOWN || message == WM_XBUTTONUP {
            let button = ((data.mouseData >> 16) & 0xffff) as u16;
            let down = message == WM_XBUTTONDOWN;
            handle_xbutton(button, down);
        }
    }
    CallNextHookEx(null_mut(), ncode, wparam, lparam)
}

fn handle_keyboard(vk: u32, down: bool) {
    if !down {
        return;
    }

    let Some((state, app)) = with_context() else {
        return;
    };

    if !macro_allowed(&state) {
        return;
    }

    if vk == VK_F1 as u32 {
        thread::spawn(|| {
            tap("escape", 35);
            tap("r", 35);
            tap("enter", 35);
        });
    } else if vk == VK_F2 as u32 {
        let enabled = state.runtime().toggle_skill_enabled(&app);
        if enabled {
            state.runtime().push_log(&app, "Skill enabled");
        } else {
            state.runtime().push_log(&app, "Skill disabled");
        }
    }
}

fn handle_xbutton(button: u16, down: bool) {
    let Some((state, app)) = with_context() else {
        return;
    };

    match (button, down) {
        (1, true) => x1_down(state, app),
        (1, false) => x1_up(state, app),
        (2, true) => x2_down(state, app),
        (2, false) => x2_up(state, app),
        _ => {}
    }
}

fn x1_down(state: AppState, app: AppHandle) {
    if !macro_allowed(&state) {
        return;
    }

    state.runtime().set_state(StateKey::X1Held, true, &app);

    thread::spawn(move || {
        let x2_held = state.runtime().state(StateKey::X2Held);
        let on_ground = state.runtime().state(StateKey::GameOnGround);
        if !x2_held && on_ground {
            tap("space", 35);
            key_down("e");
            return;
        }

        let skill_enabled = state.runtime().state(StateKey::SkillEnabled);
        let skill_ready = state.runtime().state(StateKey::GameSkillReady);
        let boomjump = state
            .config()
            .map(|config| config.skill == SkillMode::Boomjump)
            .unwrap_or(false);
        if skill_enabled && skill_ready && boomjump {
            thread::sleep(Duration::from_millis(100));
        } else {
            thread::sleep(Duration::from_millis(25));
        }
        key_down("e");
    });
}

fn x1_up(state: AppState, app: AppHandle) {
    state.runtime().set_state(StateKey::X1Held, false, &app);
    key_up("e");
}

fn x2_down(state: AppState, app: AppHandle) {
    if !macro_allowed(&state) {
        return;
    }
    state.runtime().set_state(StateKey::X2Held, true, &app);
}

fn x2_up(state: AppState, app: AppHandle) {
    state.runtime().set_state(StateKey::X2Held, false, &app);

    if !macro_allowed(&state) || state.runtime().state(StateKey::X1Held) {
        return;
    }

    thread::spawn(move || {
        let skill_enabled = state.runtime().state(StateKey::SkillEnabled);
        let skill_ready = state.runtime().state(StateKey::GameSkillReady);
        let on_ground = state.runtime().state(StateKey::GameOnGround);
        if skill_enabled && skill_ready && !on_ground {
            match state
                .config()
                .map(|config| config.skill)
                .unwrap_or(SkillMode::Normal)
            {
                SkillMode::Normal => tap("ctrl", 35),
                SkillMode::Boomjump => thread::sleep(Duration::from_millis(25)),
            }
        }
        mouse_click_left();
    });
}

fn with_context() -> Option<(AppState, AppHandle)> {
    let guard = CONTEXT.lock().ok()?;
    let context = guard.as_ref()?;
    Some((context.state.clone(), context.app.clone()))
}

fn macro_allowed(state: &AppState) -> bool {
    state.runtime().runtime_enabled.load(Ordering::SeqCst)
        && state.runtime().state(StateKey::RobloxFocused)
}

fn key_to_vk(key: &str) -> Option<u16> {
    let lower = key.to_ascii_lowercase();
    let text = lower.as_str();
    if text.len() == 1 {
        let byte = text.as_bytes()[0];
        if byte.is_ascii_alphanumeric() {
            return Some(byte.to_ascii_uppercase() as u16);
        }
    }
    match text {
        "escape" | "esc" => Some(VK_ESCAPE),
        "backspace" => Some(VK_BACK),
        "tab" => Some(VK_TAB),
        "enter" | "return" => Some(VK_RETURN),
        "ctrl" | "control" => Some(VK_LCONTROL),
        "rctrl" => Some(VK_RCONTROL),
        "shift" => Some(VK_LSHIFT),
        "rshift" => Some(VK_RSHIFT),
        "alt" => Some(VK_LMENU),
        "ralt" => Some(VK_RMENU),
        "lwin" => Some(VK_LWIN),
        "rwin" => Some(VK_RWIN),
        "space" => Some(VK_SPACE),
        "capslock" => Some(VK_CAPITAL),
        "numlock" => Some(VK_NUMLOCK),
        "scrolllock" => Some(VK_SCROLL),
        "insert" => Some(VK_INSERT),
        "delete" => Some(VK_DELETE),
        "home" => Some(VK_HOME),
        "end" => Some(VK_END),
        "pageup" => Some(VK_PRIOR),
        "pagedown" => Some(VK_NEXT),
        "left" => Some(VK_LEFT),
        "right" => Some(VK_RIGHT),
        "up" => Some(VK_UP),
        "down" => Some(VK_DOWN),
        "f1" => Some(VK_F1),
        "f2" => Some(VK_F2),
        "f3" => Some(VK_F3),
        "f4" => Some(VK_F4),
        "f5" => Some(VK_F5),
        "f6" => Some(VK_F6),
        "f7" => Some(VK_F7),
        "f8" => Some(VK_F8),
        "f9" => Some(VK_F9),
        "f10" => Some(VK_F10),
        "f11" => Some(VK_F11),
        "f12" => Some(VK_F12),
        "-" => Some(0xBD),
        "=" => Some(0xBB),
        "[" => Some(0xDB),
        "]" => Some(0xDD),
        "\\" => Some(0xDC),
        ";" => Some(0xBA),
        "'" => Some(0xDE),
        "`" => Some(0xC0),
        "," => Some(0xBC),
        "." => Some(0xBE),
        "/" => Some(0xBF),
        _ => None,
    }
}

fn send_keyboard(vk: u16, down: bool) {
    let mapped = unsafe { MapVirtualKeyW(vk as u32, MAPVK_VK_TO_VSC_EX) };
    let scan = (mapped & 0xff) as u16;
    let extended = (mapped & 0x100) != 0
        || matches!(
            vk,
            VK_RCONTROL
                | VK_RMENU
                | VK_INSERT
                | VK_DELETE
                | VK_HOME
                | VK_END
                | VK_PRIOR
                | VK_NEXT
                | VK_LEFT
                | VK_RIGHT
                | VK_UP
                | VK_DOWN
                | VK_RWIN
                | VK_LWIN
        );
    let mut flags = KEYEVENTF_SCANCODE;
    if extended {
        flags |= KEYEVENTF_EXTENDEDKEY;
    }
    if !down {
        flags |= KEYEVENTF_KEYUP;
    }

    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: 0,
                wScan: scan,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    unsafe {
        SendInput(1, &input, std::mem::size_of::<INPUT>() as i32);
    }
}

fn key_down(key: &str) {
    if let Some(vk) = key_to_vk(key) {
        send_keyboard(vk, true);
    }
}

fn key_up(key: &str) {
    if let Some(vk) = key_to_vk(key) {
        send_keyboard(vk, false);
    }
}

fn tap(key: &str, delay_ms: u64) {
    if let Some(vk) = key_to_vk(key) {
        send_keyboard(vk, true);
        thread::sleep(Duration::from_millis(delay_ms));
        send_keyboard(vk, false);
    }
}

fn mouse_click_left() {
    send_mouse(MOUSEEVENTF_LEFTDOWN, 0);
    thread::sleep(Duration::from_millis(35));
    send_mouse(MOUSEEVENTF_LEFTUP, 0);
}

fn send_mouse(flags: u32, data: u32) {
    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: data,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    unsafe {
        SendInput(1, &input, std::mem::size_of::<INPUT>() as i32);
    }
}

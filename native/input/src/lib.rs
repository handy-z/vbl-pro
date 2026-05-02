use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{LazyLock, Mutex};
use std::thread;
use std::time::Duration;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;
use serde_json::json;

use windows_sys::Win32::Foundation::{LPARAM, LRESULT, POINT, WPARAM};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, GetKeyState, MapVirtualKeyW, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD,
    INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE,
    MAPVK_VK_TO_VSC_EX, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN,
    MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
    MOUSEEVENTF_WHEEL, MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, MOUSEINPUT, VK_BACK, VK_CAPITAL,
    VK_DELETE, VK_DOWN, VK_END, VK_ESCAPE, VK_F1, VK_F10, VK_F11, VK_F12, VK_F2, VK_F3, VK_F4,
    VK_F5, VK_F6, VK_F7, VK_F8, VK_F9, VK_HOME, VK_INSERT, VK_LCONTROL, VK_LEFT, VK_LMENU,
    VK_LSHIFT, VK_LWIN, VK_NEXT, VK_NUMLOCK, VK_PRIOR, VK_RCONTROL, VK_RETURN, VK_RIGHT, VK_RMENU,
    VK_RSHIFT, VK_RWIN, VK_SCROLL, VK_SPACE, VK_TAB, VK_UP, VK_XBUTTON1, VK_XBUTTON2,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetCursorPos, GetMessageW, PeekMessageW, PostThreadMessageW,
    SetCursorPos, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, KBDLLHOOKSTRUCT, MSG,
    MSLLHOOKSTRUCT, PM_NOREMOVE, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN,
    WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_QUIT,
    WM_RBUTTONDOWN, WM_RBUTTONUP, WM_SYSKEYDOWN, WM_SYSKEYUP, WM_XBUTTONDOWN, WM_XBUTTONUP,
};

struct HookContext {
    callback: ThreadsafeFunction<String>,
    keyboard_hook: usize,
    mouse_hook: usize,
}

unsafe impl Send for HookContext {}

static CONTEXT: LazyLock<Mutex<Option<HookContext>>> = LazyLock::new(|| Mutex::new(None));
static RUNNING: AtomicBool = AtomicBool::new(false);
static THREAD_ID: AtomicU32 = AtomicU32::new(0);
static X2_STOP: AtomicBool = AtomicBool::new(false);
static X2_RUNNING: AtomicBool = AtomicBool::new(false);

fn key_to_vk(key: &str) -> Option<u16> {
    let lower = key.to_ascii_lowercase();
    let s = lower.as_str();
    if s.len() == 1 {
        let b = s.as_bytes()[0];
        if b.is_ascii_alphanumeric() {
            return Some(b.to_ascii_uppercase() as u16);
        }
    }
    match s {
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

fn vk_to_keycode(vk: u32) -> u32 {
    match vk {
        0x1B => 1,
        0x08 => 14,
        0x09 => 15,
        0x0D => 28,
        0x11 | 0xA2 => 29,
        0xA3 => 3613,
        0x10 | 0xA0 => 42,
        0xA1 => 54,
        0x12 | 0xA4 => 56,
        0xA5 => 3640,
        0x20 => 57,
        0x70 => 59,
        0x71 => 60,
        0x72 => 61,
        0x73 => 62,
        0x74 => 63,
        0x75 => 64,
        0x76 => 65,
        0x77 => 66,
        0x78 => 67,
        0x79 => 68,
        0x7A => 87,
        0x7B => 88,
        0x41 => 30,
        0x42 => 48,
        0x43 => 46,
        0x44 => 32,
        0x45 => 18,
        0x46 => 33,
        0x47 => 34,
        0x48 => 35,
        0x49 => 23,
        0x4A => 36,
        0x4B => 37,
        0x4C => 38,
        0x4D => 50,
        0x4E => 49,
        0x4F => 24,
        0x50 => 25,
        0x51 => 16,
        0x52 => 19,
        0x53 => 31,
        0x54 => 20,
        0x55 => 22,
        0x56 => 47,
        0x57 => 17,
        0x58 => 45,
        0x59 => 21,
        0x5A => 44,
        0x31 => 2,
        0x32 => 3,
        0x33 => 4,
        0x34 => 5,
        0x35 => 6,
        0x36 => 7,
        0x37 => 8,
        0x38 => 9,
        0x39 => 10,
        0x30 => 11,
        0x26 => 57416,
        0x25 => 57419,
        0x27 => 57421,
        0x28 => 57424,
        _ => vk,
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

fn tap_vk(vk: u16, delay_ms: u64) {
    send_keyboard(vk, true);
    thread::sleep(Duration::from_millis(delay_ms));
    send_keyboard(vk, false);
}

fn send_mouse(flags: u32, data: u32, dx: i32, dy: i32) {
    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx,
                dy,
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

fn mouse_button(button: &str, down: bool) -> Option<(u32, u32)> {
    match button.to_ascii_lowercase().as_str() {
        "left" => Some((
            if down {
                MOUSEEVENTF_LEFTDOWN
            } else {
                MOUSEEVENTF_LEFTUP
            },
            0,
        )),
        "right" => Some((
            if down {
                MOUSEEVENTF_RIGHTDOWN
            } else {
                MOUSEEVENTF_RIGHTUP
            },
            0,
        )),
        "middle" => Some((
            if down {
                MOUSEEVENTF_MIDDLEDOWN
            } else {
                MOUSEEVENTF_MIDDLEUP
            },
            0,
        )),
        "x1" => Some((
            if down {
                MOUSEEVENTF_XDOWN
            } else {
                MOUSEEVENTF_XUP
            },
            1,
        )),
        "x2" => Some((
            if down {
                MOUSEEVENTF_XDOWN
            } else {
                MOUSEEVENTF_XUP
            },
            2,
        )),
        _ => None,
    }
}

fn emit_event(value: serde_json::Value) {
    if let Ok(guard) = CONTEXT.lock() {
        if let Some(ctx) = guard.as_ref() {
            ctx.callback.call(
                Ok(value.to_string()),
                ThreadsafeFunctionCallMode::NonBlocking,
            );
        }
    }
}

unsafe extern "system" fn keyboard_proc(ncode: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if ncode >= 0 {
        let data = *(lparam as *const KBDLLHOOKSTRUCT);
        let event = match wparam as u32 {
            WM_KEYDOWN | WM_SYSKEYDOWN => Some("keydown"),
            WM_KEYUP | WM_SYSKEYUP => Some("keyup"),
            _ => None,
        };
        if let Some(event) = event {
            emit_event(json!({
                "type": event,
                "keycode": vk_to_keycode(data.vkCode),
                "rawcode": data.vkCode,
                "scanCode": data.scanCode,
                "altKey": (data.flags & 32) != 0,
                "time": data.time
            }));
        }
    }
    CallNextHookEx(std::ptr::null_mut(), ncode, wparam, lparam)
}

unsafe extern "system" fn mouse_proc(ncode: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if ncode >= 0 {
        let data = *(lparam as *const MSLLHOOKSTRUCT);
        let message = wparam as u32;
        match message {
            WM_LBUTTONDOWN | WM_LBUTTONUP | WM_RBUTTONDOWN | WM_RBUTTONUP | WM_MBUTTONDOWN
            | WM_MBUTTONUP | WM_XBUTTONDOWN | WM_XBUTTONUP => {
                let button = match message {
                    WM_LBUTTONDOWN | WM_LBUTTONUP => 1,
                    WM_RBUTTONDOWN | WM_RBUTTONUP => 2,
                    WM_MBUTTONDOWN | WM_MBUTTONUP => 3,
                    _ => {
                        let x = (data.mouseData >> 16) & 0xffff;
                        if x == 1 {
                            4
                        } else {
                            5
                        }
                    }
                };
                let event = match message {
                    WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN | WM_XBUTTONDOWN => {
                        "mousedown"
                    }
                    _ => "mouseup",
                };
                emit_event(json!({
                    "type": event,
                    "button": button,
                    "x": data.pt.x,
                    "y": data.pt.y,
                    "clicks": 1
                }));
            }
            WM_MOUSEMOVE => {
                emit_event(json!({
                    "type": "mousemove",
                    "x": data.pt.x,
                    "y": data.pt.y
                }));
            }
            WM_MOUSEWHEEL => {
                let delta = ((data.mouseData >> 16) as i16) as i32;
                emit_event(json!({
                    "type": "wheel",
                    "x": data.pt.x,
                    "y": data.pt.y,
                    "rotation": -delta / 120,
                    "direction": 3
                }));
            }
            _ => {}
        }
    }
    CallNextHookEx(std::ptr::null_mut(), ncode, wparam, lparam)
}

#[napi]
pub fn key_down(key: String) {
    if let Some(vk) = key_to_vk(&key) {
        send_keyboard(vk, true);
    }
}

#[napi]
pub fn key_up(key: String) {
    if let Some(vk) = key_to_vk(&key) {
        send_keyboard(vk, false);
    }
}

#[napi]
pub fn key_tap(key: String, delay_ms: Option<u32>) {
    if let Some(vk) = key_to_vk(&key) {
        tap_vk(vk, delay_ms.unwrap_or(35) as u64);
    }
}

#[napi]
pub fn write_text(text: String, char_delay_ms: Option<u32>) {
    for unit in text.encode_utf16() {
        let down = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: 0,
                    wScan: unit,
                    dwFlags: 4,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let up = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: 0,
                    wScan: unit,
                    dwFlags: 4 | KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        unsafe {
            SendInput(1, &down, std::mem::size_of::<INPUT>() as i32);
            SendInput(1, &up, std::mem::size_of::<INPUT>() as i32);
        }
        if let Some(ms) = char_delay_ms {
            thread::sleep(Duration::from_millis(ms as u64));
        }
    }
}

#[napi]
pub fn is_key_down(key: String) -> bool {
    key_to_vk(&key)
        .map(|vk| unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 })
        .unwrap_or(false)
}

#[napi]
pub fn get_toggle_state(key: String) -> bool {
    key_to_vk(&key)
        .map(|vk| unsafe { (GetKeyState(vk as i32) & 1) == 1 })
        .unwrap_or(false)
}

#[napi]
pub fn mouse_down(button: String) {
    if let Some((flags, data)) = mouse_button(&button, true) {
        send_mouse(flags, data, 0, 0);
    }
}

#[napi]
pub fn mouse_up(button: String) {
    if let Some((flags, data)) = mouse_button(&button, false) {
        send_mouse(flags, data, 0, 0);
    }
}

#[napi]
pub fn mouse_click(button: String, delay_ms: Option<u32>) {
    mouse_down(button.clone());
    thread::sleep(Duration::from_millis(delay_ms.unwrap_or(35) as u64));
    mouse_up(button);
}

#[napi]
pub fn mouse_move_to(x: i32, y: i32) {
    unsafe {
        SetCursorPos(x, y);
    }
}

#[napi]
pub fn mouse_move_by(dx: i32, dy: i32) {
    send_mouse(MOUSEEVENTF_MOVE, 0, dx, dy);
}

#[napi]
pub fn mouse_wheel(amount: i32) {
    send_mouse(MOUSEEVENTF_WHEEL, amount as u32, 0, 0);
}

#[napi]
pub fn mouse_position() -> Vec<i32> {
    unsafe {
        let mut point = POINT { x: 0, y: 0 };
        GetCursorPos(&mut point);
        vec![point.x, point.y]
    }
}

#[napi]
pub fn is_mouse_down(button: String) -> bool {
    let vk = match button.to_ascii_lowercase().as_str() {
        "left" => 1,
        "right" => 2,
        "middle" => 4,
        "x1" => VK_XBUTTON1 as i32,
        "x2" => VK_XBUTTON2 as i32,
        _ => return false,
    };
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

#[napi(ts_args_type = "callback: (err: any, json: string) => void")]
pub fn start_hook(callback: ThreadsafeFunction<String>) -> Result<()> {
    if RUNNING.load(Ordering::SeqCst) {
        return Ok(());
    }

    if let Ok(mut guard) = CONTEXT.lock() {
        *guard = Some(HookContext {
            callback,
            keyboard_hook: 0,
            mouse_hook: 0,
        });
    } else {
        return Ok(());
    }

    RUNNING.store(true, Ordering::SeqCst);

    thread::spawn(move || unsafe {
        let mut msg: MSG = std::mem::zeroed();
        PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_NOREMOVE);
        THREAD_ID.store(
            windows_sys::Win32::System::Threading::GetCurrentThreadId(),
            Ordering::SeqCst,
        );

        let keyboard_hook =
            SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), std::ptr::null_mut(), 0);
        let mouse_hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), std::ptr::null_mut(), 0);

        if let Ok(mut guard) = CONTEXT.lock() {
            if let Some(ctx) = guard.as_mut() {
                ctx.keyboard_hook = keyboard_hook as usize;
                ctx.mouse_hook = mouse_hook as usize;
            }
        }

        if keyboard_hook.is_null() || mouse_hook.is_null() {
            if !keyboard_hook.is_null() {
                UnhookWindowsHookEx(keyboard_hook);
            }
            if !mouse_hook.is_null() {
                UnhookWindowsHookEx(mouse_hook);
            }
            THREAD_ID.store(0, Ordering::SeqCst);
            if let Ok(mut guard) = CONTEXT.lock() {
                *guard = None;
            }
            RUNNING.store(false, Ordering::SeqCst);
            return;
        }

        while RUNNING.load(Ordering::SeqCst)
            && GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0
        {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        UnhookWindowsHookEx(keyboard_hook);
        UnhookWindowsHookEx(mouse_hook);
        THREAD_ID.store(0, Ordering::SeqCst);
        if let Ok(mut guard) = CONTEXT.lock() {
            *guard = None;
        }
        RUNNING.store(false, Ordering::SeqCst);
    });

    Ok(())
}

#[napi]
pub fn stop_hook() {
    RUNNING.store(false, Ordering::SeqCst);
    let thread_id = THREAD_ID.load(Ordering::SeqCst);
    if thread_id != 0 {
        unsafe {
            PostThreadMessageW(thread_id, WM_QUIT, 0, 0);
        }
    }
}

#[napi]
pub fn start_x2_loop(
    mut sab: Int32Array,
    x2_held_slot: u32,
    game_on_ground_slot: u32,
    skill_enabled_slot: u32,
    game_skill_ready_slot: u32,
    boomjump: bool,
) {
    if X2_RUNNING.load(Ordering::SeqCst) {
        return;
    }

    let sab_ptr = unsafe { sab.as_mut().as_mut_ptr() as usize };
    let x2_held_slot = x2_held_slot as usize;
    let game_on_ground_slot = game_on_ground_slot as usize;
    let skill_enabled_slot = skill_enabled_slot as usize;
    let game_skill_ready_slot = game_skill_ready_slot as usize;

    X2_STOP.store(false, Ordering::SeqCst);
    X2_RUNNING.store(true, Ordering::SeqCst);

    thread::spawn(move || {
        while !X2_STOP.load(Ordering::SeqCst) {
            let ptr = sab_ptr as *const i32;
            let x2_held = unsafe { std::ptr::read_volatile(ptr.add(x2_held_slot)) } != 0;
            let game_on_ground =
                unsafe { std::ptr::read_volatile(ptr.add(game_on_ground_slot)) } != 0;

            if x2_held && game_on_ground {
                let skill_enabled =
                    unsafe { std::ptr::read_volatile(ptr.add(skill_enabled_slot)) } != 0;
                let game_skill_ready =
                    unsafe { std::ptr::read_volatile(ptr.add(game_skill_ready_slot)) } != 0;

                if skill_enabled && game_skill_ready && boomjump {
                    if let (Some(shift), Some(ctrl)) = (key_to_vk("shift"), key_to_vk("ctrl")) {
                        tap_vk(shift, 35);
                        tap_vk(ctrl, 35);
                        thread::sleep(Duration::from_millis(25));
                        tap_vk(shift, 35);
                    }
                } else if let (Some(shift), Some(space)) = (key_to_vk("shift"), key_to_vk("space"))
                {
                    tap_vk(shift, 35);
                    tap_vk(space, 35);
                    tap_vk(shift, 35);
                }
            }

            thread::sleep(Duration::from_millis(1));
        }

        X2_RUNNING.store(false, Ordering::SeqCst);
    });
}

#[napi]
pub fn stop_x2_loop() {
    X2_STOP.store(true, Ordering::SeqCst);
}

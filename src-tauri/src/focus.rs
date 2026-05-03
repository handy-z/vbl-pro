use crate::config::StateKey;
use crate::state::AppState;
use crate::windows_util::{foreground_root_window, is_process_window, root_window, ROBLOX_PROCESS};
use once_cell::sync::Lazy;
use std::ptr::null_mut;
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use std::thread;
use tauri::AppHandle;
use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetMessageW, PeekMessageW, PostThreadMessageW, TranslateMessage,
    EVENT_SYSTEM_FOREGROUND, MSG, PM_NOREMOVE, WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS,
    WM_QUIT,
};

struct FocusContext {
    state: AppState,
    app: AppHandle,
    last_focused: Option<bool>,
}

unsafe impl Send for FocusContext {}

static CONTEXT: Lazy<Mutex<Option<FocusContext>>> = Lazy::new(|| Mutex::new(None));

pub fn start(state: AppState, app: AppHandle) {
    if state
        .runtime()
        .focus_monitor_running
        .swap(true, Ordering::SeqCst)
    {
        return;
    }

    if let Ok(mut guard) = CONTEXT.lock() {
        *guard = Some(FocusContext {
            state: state.clone(),
            app: app.clone(),
            last_focused: None,
        });
    } else {
        state
            .runtime()
            .focus_monitor_running
            .store(false, Ordering::SeqCst);
        state
            .runtime()
            .push_error(&app, "Focus monitor lock failed");
        return;
    }

    let thread_state = state.clone();
    let thread_app = app.clone();
    let thread = thread::Builder::new()
        .name("vbl-pro-focus".to_string())
        .spawn(move || unsafe {
            let mut message: MSG = std::mem::zeroed();
            PeekMessageW(&mut message, null_mut(), 0, 0, PM_NOREMOVE);
            thread_state
                .runtime()
                .focus_thread_id
                .store(GetCurrentThreadId(), Ordering::SeqCst);

            let hook = SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                null_mut(),
                Some(win_event_proc),
                0,
                0,
                WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
            );

            if hook.is_null() {
                thread_state
                    .runtime()
                    .focus_thread_id
                    .store(0, Ordering::SeqCst);
                thread_state
                    .runtime()
                    .focus_monitor_running
                    .store(false, Ordering::SeqCst);
                if let Ok(mut guard) = CONTEXT.lock() {
                    *guard = None;
                }
                thread_state
                    .runtime()
                    .push_error(&thread_app, "Failed to start Roblox focus monitor");
                return;
            }

            update_focus(foreground_root_window());

            while thread_state
                .runtime()
                .runtime_enabled
                .load(Ordering::SeqCst)
                && GetMessageW(&mut message, null_mut(), 0, 0) > 0
            {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }

            UnhookWinEvent(hook);
            thread_state
                .runtime()
                .focus_thread_id
                .store(0, Ordering::SeqCst);
            thread_state
                .runtime()
                .focus_monitor_running
                .store(false, Ordering::SeqCst);
            thread_state
                .runtime()
                .set_state(StateKey::RobloxFocused, false, &thread_app);
            if let Ok(mut guard) = CONTEXT.lock() {
                *guard = None;
            }
            thread_state.runtime().emit_status(&thread_app);
        });

    if let Err(err) = thread {
        state
            .runtime()
            .focus_monitor_running
            .store(false, Ordering::SeqCst);
        state
            .runtime()
            .push_error(&app, format!("Failed to spawn focus monitor: {err}"));
    }
}

pub fn stop(state: &AppState) {
    let thread_id = state.runtime().focus_thread_id.load(Ordering::SeqCst);
    if thread_id != 0 {
        unsafe {
            PostThreadMessageW(thread_id, WM_QUIT, 0, 0);
        }
    }
}

unsafe extern "system" fn win_event_proc(
    _: HWINEVENTHOOK,
    _: u32,
    hwnd: HWND,
    _: i32,
    _: i32,
    _: u32,
    _: u32,
) {
    update_focus(hwnd);
}

unsafe fn update_focus(hwnd: HWND) {
    let root = root_window(hwnd);
    let focused = is_process_window(root, ROBLOX_PROCESS);
    let Ok(mut guard) = CONTEXT.lock() else {
        return;
    };
    let Some(context) = guard.as_mut() else {
        return;
    };

    if focused {
        context
            .state
            .runtime()
            .last_roblox_hwnd
            .store(root as isize, Ordering::SeqCst);
    }

    context
        .state
        .runtime()
        .set_state(StateKey::RobloxFocused, focused, &context.app);

    if context.last_focused != Some(focused) {
        context.last_focused = Some(focused);
        if focused {
            context.runtime_log("Roblox focused");
        } else {
            context.runtime_log("Roblox unfocused");
        }
    }
}

impl FocusContext {
    fn runtime_log(&self, message: &str) {
        self.state.runtime().push_log(&self.app, message);
    }
}

use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{LazyLock, Mutex};
use std::thread;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;

use windows_sys::Win32::Foundation::CloseHandle;
use windows_sys::Win32::System::Threading::{
    GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId, PeekMessageW,
    PostThreadMessageW, TranslateMessage, EVENT_SYSTEM_FOREGROUND, MSG, PM_NOREMOVE,
    WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS, WM_QUIT,
};

struct FocusContext {
    sab_ptr: usize,
    slot: usize,
    target: String,
    callback: ThreadsafeFunction<bool>,
    last_focused: Option<bool>,
}

unsafe impl Send for FocusContext {}

static CONTEXT: LazyLock<Mutex<Option<FocusContext>>> = LazyLock::new(|| Mutex::new(None));
static STOP_FLAG: AtomicBool = AtomicBool::new(false);
static IS_RUNNING: AtomicBool = AtomicBool::new(false);
static EVENT_THREAD_ID: AtomicU32 = AtomicU32::new(0);

fn get_process_name_for_window(hwnd: windows_sys::Win32::Foundation::HWND) -> Option<String> {
    unsafe {
        if hwnd.is_null() {
            return None;
        }

        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 {
            return None;
        }

        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }

        let mut buf: [u16; 512] = [0; 512];
        let mut size = 512;
        let ok = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size);
        CloseHandle(handle);

        if ok == 0 {
            return None;
        }

        let os_str = OsString::from_wide(&buf[..size as usize]);
        let full_path = os_str.to_string_lossy().to_string();

        let file_name = full_path.split('\\').last()?.to_string();
        Some(file_name)
    }
}

fn set_focus_state(hwnd: windows_sys::Win32::Foundation::HWND) {
    let mut guard = match CONTEXT.lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };

    let Some(ctx) = guard.as_mut() else {
        return;
    };

    let focused = get_process_name_for_window(hwnd)
        .map(|name| name == ctx.target)
        .unwrap_or(false);

    if ctx.last_focused == Some(focused) {
        return;
    }

    ctx.last_focused = Some(focused);

    unsafe {
        let ptr = ctx.sab_ptr as *mut i32;
        std::ptr::write_volatile(ptr.add(ctx.slot), if focused { 1 } else { 0 });
    }

    ctx.callback
        .call(Ok(focused), ThreadsafeFunctionCallMode::NonBlocking);
}

unsafe extern "system" fn win_event_proc(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: windows_sys::Win32::Foundation::HWND,
    _id_object: i32,
    _id_child: i32,
    _event_thread: u32,
    _event_time: u32,
) {
    if event == EVENT_SYSTEM_FOREGROUND {
        set_focus_state(hwnd);
    }
}

#[napi(
    ts_args_type = "sab: Int32Array, slot: number, target: string, callback: (err: any, active: boolean) => void"
)]
pub fn start_focus_monitor(
    mut sab: Int32Array,
    slot: u32,
    target: String,
    callback: ThreadsafeFunction<bool>,
) -> Result<()> {
    if IS_RUNNING.load(Ordering::SeqCst) {
        return Ok(());
    }

    let sab_ptr = unsafe { sab.as_mut().as_mut_ptr() as usize };
    let slot = slot as usize;

    if let Ok(mut guard) = CONTEXT.lock() {
        *guard = Some(FocusContext {
            sab_ptr,
            slot,
            target,
            callback,
            last_focused: None,
        });
    } else {
        IS_RUNNING.store(false, Ordering::SeqCst);
        return Ok(());
    }

    STOP_FLAG.store(false, Ordering::SeqCst);
    IS_RUNNING.store(true, Ordering::SeqCst);

    thread::spawn(move || unsafe {
        let mut msg: MSG = std::mem::zeroed();
        PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_NOREMOVE);
        EVENT_THREAD_ID.store(GetCurrentThreadId(), Ordering::SeqCst);

        let hook = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            std::ptr::null_mut(),
            Some(win_event_proc),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        );

        if hook.is_null() {
            EVENT_THREAD_ID.store(0, Ordering::SeqCst);
            if let Ok(mut guard) = CONTEXT.lock() {
                *guard = None;
            }
            IS_RUNNING.store(false, Ordering::SeqCst);
            return;
        }

        set_focus_state(GetForegroundWindow());

        while !STOP_FLAG.load(Ordering::SeqCst)
            && GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0
        {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        UnhookWinEvent(hook);
        EVENT_THREAD_ID.store(0, Ordering::SeqCst);
        if let Ok(mut guard) = CONTEXT.lock() {
            *guard = None;
        }
        IS_RUNNING.store(false, Ordering::SeqCst);
    });

    Ok(())
}

#[napi]
pub fn stop_focus_monitor() {
    STOP_FLAG.store(true, Ordering::SeqCst);
    let thread_id = EVENT_THREAD_ID.load(Ordering::SeqCst);
    if thread_id != 0 {
        unsafe {
            PostThreadMessageW(thread_id, WM_QUIT, 0, 0);
        }
    }
}

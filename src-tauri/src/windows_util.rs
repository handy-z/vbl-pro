use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use windows_sys::Win32::Foundation::{CloseHandle, HWND, POINT, RECT};
use windows_sys::Win32::Graphics::Gdi::ClientToScreen;
use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetClientRect, GetForegroundWindow, GetSystemMetrics, GetWindowThreadProcessId,
    IsIconic, IsWindowVisible, GA_ROOT, SM_CXSCREEN, SM_CYSCREEN,
};

pub const ROBLOX_PROCESS: &str = "RobloxPlayerBeta.exe";

pub unsafe fn foreground_root_window() -> HWND {
    let foreground = GetForegroundWindow();
    root_window(foreground)
}

pub unsafe fn root_window(hwnd: HWND) -> HWND {
    if hwnd.is_null() {
        return hwnd;
    }
    let root = GetAncestor(hwnd, GA_ROOT);
    if root.is_null() {
        hwnd
    } else {
        root
    }
}

pub unsafe fn is_valid_visible_window(hwnd: HWND) -> bool {
    !hwnd.is_null() && IsWindowVisible(hwnd) != 0 && IsIconic(hwnd) == 0
}

pub unsafe fn is_process_window(hwnd: HWND, process_name: &str) -> bool {
    if !is_valid_visible_window(hwnd) {
        return false;
    }
    window_process_name(hwnd)
        .map(|name| name.eq_ignore_ascii_case(process_name))
        .unwrap_or(false)
}

pub unsafe fn window_process_name(hwnd: HWND) -> Option<String> {
    if hwnd.is_null() {
        return None;
    }

    let mut pid = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    if pid == 0 {
        return None;
    }

    let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if process.is_null() {
        return None;
    }

    let mut buffer = [0u16; 1024];
    let mut size = buffer.len() as u32;
    let ok = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut size);
    CloseHandle(process);
    if ok == 0 || size == 0 {
        return None;
    }

    let os = OsString::from_wide(&buffer[..size as usize]);
    let path = os.to_string_lossy();
    path.rsplit('\\').next().map(|name| name.to_string())
}

pub unsafe fn client_center_position(
    hwnd: HWND,
    image_width: i32,
    image_height: i32,
) -> Option<(i32, i32)> {
    if !is_valid_visible_window(hwnd) {
        return None;
    }

    let mut rect: RECT = std::mem::zeroed();
    if GetClientRect(hwnd, &mut rect) == 0 {
        return None;
    }
    let width = rect.right - rect.left;
    let height = rect.bottom - rect.top;
    if width <= 0 || height <= 0 {
        return None;
    }

    let mut origin = POINT { x: 0, y: 0 };
    if ClientToScreen(hwnd, &mut origin) == 0 {
        return None;
    }

    Some((
        origin.x + (width - image_width) / 2,
        origin.y + (height - image_height) / 2,
    ))
}

pub unsafe fn screen_size() -> (i32, i32) {
    (GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN))
}

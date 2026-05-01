use napi::bindgen_prelude::*;
use napi_derive::napi;
use once_cell::sync::OnceCell;
use std::ffi::c_void;
use std::iter::once;
use std::mem::{size_of, zeroed};
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
use windows_sys::Win32::Foundation::{
    CloseHandle, HANDLE, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WAIT_FAILED, WAIT_OBJECT_0,
    WPARAM,
};
use windows_sys::Win32::Graphics::Gdi::{
    ClientToScreen, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC,
    SelectObject, AC_SRC_ALPHA, AC_SRC_OVER, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION,
    DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::{
    CreateEventW, GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW, SetEvent, INFINITE,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows_sys::Win32::UI::HiDpi::{
    SetProcessDpiAwarenessContext, SetThreadDpiAwarenessContext,
    DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetAncestor, GetClientRect,
    GetForegroundWindow, GetWindowLongPtrW, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    KillTimer, MsgWaitForMultipleObjects, PeekMessageW, PostThreadMessageW, RegisterClassExW,
    SetTimer, SetWindowLongPtrW, SetWindowPos, ShowWindow, TranslateMessage, UpdateLayeredWindow,
    CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, EVENT_OBJECT_LOCATIONCHANGE, EVENT_SYSTEM_FOREGROUND,
    GA_ROOT, GWLP_USERDATA, HWND_TOPMOST, MSG, PM_REMOVE, QS_ALLINPUT, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOSIZE, SW_HIDE, SW_SHOWNOACTIVATE, ULW_ALPHA, WINEVENT_OUTOFCONTEXT,
    WINEVENT_SKIPOWNPROCESS, WM_APP, WM_DESTROY, WM_QUIT, WM_TIMER, WNDCLASSEXW, WS_EX_LAYERED,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};

const DEFAULT_TARGET_PROCESS: &str = "RobloxPlayerBeta.exe";
const CLASS_NAME: &str = "VBLProCrosshairOverlayWindow";
const WINDOW_NAME: &str = "VBLProCrosshairOverlay";
const TIMER_REFRESH: usize = 1;
const WM_OVERLAY_REFRESH: u32 = WM_APP + 41;

static OVERLAY: OnceCell<Mutex<Option<OverlayHandle>>> = OnceCell::new();
static OVERLAY_THREAD_ID: AtomicU32 = AtomicU32::new(0);

#[napi(object)]
pub struct CrosshairOffset {
    pub x: i32,
    pub y: i32,
}

#[napi(object)]
pub struct CrosshairConfig {
    pub enabled: bool,
    pub color: String,
    pub offset: CrosshairOffset,
    pub scale: f64,
}

struct OverlayHandle {

    stop_event: isize,
    thread: JoinHandle<()>,
}

struct DecodedImage {
    width: i32,
    height: i32,
    pixels: Vec<u8>,
}

struct LayeredImage {
    hdc: HDC,
    bitmap: HBITMAP,
    previous: HGDIOBJ,
    width: i32,
    height: i32,
}

struct OverlayThreadState {
    hwnd: HWND,
    image: LayeredImage,
    target_process_name: String,
    visible: bool,
    offset_x: i32,
    offset_y: i32,
}

#[napi(js_name = "startOverlay")]
pub fn start_overlay(image: Buffer, config: CrosshairConfig, target_process_name: Option<String>) -> Result<()> {
    let decoded = decode_image(&image, &config)?;
    let target_process_name =
        target_process_name.unwrap_or_else(|| DEFAULT_TARGET_PROCESS.to_string());
    let slot = OVERLAY.get_or_init(|| Mutex::new(None));
    let mut guard = slot
        .lock()
        .map_err(|_| Error::from_reason("Overlay state lock failed"))?;
    cleanup_finished(&mut guard);
    if guard.is_some() {
        return Ok(());
    }

    let stop_event = unsafe { CreateEventW(null(), 1, 0, null()) };
    if stop_event == 0 as HANDLE {
        return Err(Error::from_reason("Failed to create overlay stop event"));
    }

    let stop_event_value = stop_event as isize;
    let offset_x = config.offset.x;
    let offset_y = config.offset.y;
    let thread = thread::Builder::new()
        .name("vbl-pro-overlay".to_string())
        .spawn(move || unsafe {
            run_overlay_thread(
                decoded,
                target_process_name,
                stop_event_value as HANDLE,
                offset_x,
                offset_y,
            );
        })
        .map_err(|err| {
            unsafe {
                CloseHandle(stop_event);
            }
            Error::from_reason(format!("Failed to start overlay thread: {err}"))
        })?;

    *guard = Some(OverlayHandle {
        stop_event: stop_event_value,
        thread,
    });
    Ok(())
}

#[napi(js_name = "stopOverlay")]
pub fn stop_overlay() -> Result<()> {
    let handle = {
        let slot = OVERLAY.get_or_init(|| Mutex::new(None));
        let mut guard = slot
            .lock()
            .map_err(|_| Error::from_reason("Overlay state lock failed"))?;
        cleanup_finished(&mut guard);
        guard.take()
    };

    if let Some(handle) = handle {
        unsafe {
            SetEvent(handle.stop_event as HANDLE);
        }
        let _ = handle.thread.join();
        unsafe {
            CloseHandle(handle.stop_event as HANDLE);
        }
    }

    Ok(())
}

#[napi(js_name = "isOverlayRunning")]
pub fn is_overlay_running() -> Result<bool> {
    let slot = OVERLAY.get_or_init(|| Mutex::new(None));
    let mut guard = slot
        .lock()
        .map_err(|_| Error::from_reason("Overlay state lock failed"))?;
    cleanup_finished(&mut guard);
    Ok(guard.is_some())
}

fn cleanup_finished(slot: &mut Option<OverlayHandle>) {
    let finished = slot
        .as_ref()
        .map(|handle| handle.thread.is_finished())
        .unwrap_or(false);

    if finished {
        if let Some(handle) = slot.take() {
            let _ = handle.thread.join();
            unsafe {
                CloseHandle(handle.stop_event as HANDLE);
            }
        }
    }
}

fn parse_hex_color(hex: &str) -> Option<[u8; 3]> {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some([r, g, b])
}

fn decode_image(image: &[u8], config: &CrosshairConfig) -> Result<DecodedImage> {
    let mut rgba = image::load_from_memory(image)
        .map_err(|err| Error::from_reason(format!("Failed to decode crosshair image: {err}")))?
        .to_rgba8();

    if config.scale != 1.0 && config.scale > 0.0 {
        let new_width = (rgba.width() as f64 * config.scale) as u32;
        let new_height = (rgba.height() as f64 * config.scale) as u32;
        rgba = image::imageops::resize(
            &rgba,
            new_width,
            new_height,
            image::imageops::FilterType::Nearest,
        );
    }

    let tint = parse_hex_color(&config.color).unwrap_or([255, 255, 255]);

    let (width, height) = rgba.dimensions();
    if width == 0 || height == 0 || width > i32::MAX as u32 || height > i32::MAX as u32 {
        return Err(Error::from_reason("Invalid crosshair image size"));
    }

    let mut pixels = Vec::with_capacity((width * height * 4) as usize);
    for pixel in rgba.pixels() {
        let r = ((pixel.0[0] as u16 * tint[0] as u16) / 255) as u8;
        let g = ((pixel.0[1] as u16 * tint[1] as u16) / 255) as u8;
        let b = ((pixel.0[2] as u16 * tint[2] as u16) / 255) as u8;
        let a = pixel.0[3];

        pixels.push(premultiply(b, a));
        pixels.push(premultiply(g, a));
        pixels.push(premultiply(r, a));
        pixels.push(a);
    }

    Ok(DecodedImage {
        width: width as i32,
        height: height as i32,
        pixels,
    })
}

fn premultiply(color: u8, alpha: u8) -> u8 {
    (((color as u16 * alpha as u16) + 127) / 255) as u8
}

unsafe fn run_overlay_thread(
    image: DecodedImage,
    target_process_name: String,
    stop_event: HANDLE,
    offset_x: i32,
    offset_y: i32,
) {
    let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    let _ = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    let class_name = wide(CLASS_NAME);
    let window_name = wide(WINDOW_NAME);
    let instance = GetModuleHandleW(null());
    let window_class = WNDCLASSEXW {
        cbSize: size_of::<WNDCLASSEXW>() as u32,
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(window_proc),
        cbClsExtra: 0,
        cbWndExtra: 0,
        hInstance: instance,
        hIcon: 0 as _,
        hCursor: 0 as _,
        hbrBackground: 0 as _,
        lpszMenuName: null(),
        lpszClassName: class_name.as_ptr(),
        hIconSm: 0 as _,
    };
    RegisterClassExW(&window_class);

    let hwnd = CreateWindowExW(
        WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_NOACTIVATE,
        class_name.as_ptr(),
        window_name.as_ptr(),
        WS_POPUP,
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        image.width,
        image.height,
        0 as _,
        0 as _,
        instance,
        null_mut(),
    );
    if hwnd == 0 as HWND {
        return;
    }

    let Some(layered_image) = LayeredImage::new(image) else {
        DestroyWindow(hwnd);
        return;
    };

    let state = Box::new(OverlayThreadState {
        hwnd,
        image: layered_image,
        target_process_name,
        visible: false,
        offset_x,
        offset_y,
    });
    let state_ptr = Box::into_raw(state);
    SetWindowLongPtrW(hwnd, GWLP_USERDATA, state_ptr as isize);
    SetTimer(hwnd, TIMER_REFRESH, 250, None);
    OVERLAY_THREAD_ID.store(GetCurrentThreadId(), Ordering::SeqCst);

    let foreground_hook = SetWinEventHook(
        EVENT_SYSTEM_FOREGROUND,
        EVENT_SYSTEM_FOREGROUND,
        0 as _,
        Some(win_event_proc),
        0,
        0,
        WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
    );
    let location_hook = SetWinEventHook(
        EVENT_OBJECT_LOCATIONCHANGE,
        EVENT_OBJECT_LOCATIONCHANGE,
        0 as _,
        Some(win_event_proc),
        0,
        0,
        WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
    );

    refresh_window(hwnd);
    message_loop(stop_event);

    if foreground_hook != 0 as HWINEVENTHOOK {
        UnhookWinEvent(foreground_hook);
    }
    if location_hook != 0 as HWINEVENTHOOK {
        UnhookWinEvent(location_hook);
    }
    OVERLAY_THREAD_ID.store(0, Ordering::SeqCst);
    KillTimer(hwnd, TIMER_REFRESH);
    ShowWindow(hwnd, SW_HIDE);
    SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
    DestroyWindow(hwnd);
    drop(Box::from_raw(state_ptr));
}

unsafe fn message_loop(stop_event: HANDLE) {
    let handles = [stop_event];

    loop {
        let wait = MsgWaitForMultipleObjects(1, handles.as_ptr(), 0, INFINITE, QS_ALLINPUT);
        if wait == WAIT_OBJECT_0 {
            break;
        }
        if wait == WAIT_FAILED {
            break;
        }

        let mut message: MSG = zeroed();
        while PeekMessageW(&mut message, 0 as _, 0, 0, PM_REMOVE) != 0 {
            if message.message == WM_QUIT {
                return;
            }
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match message {
        WM_TIMER => {
            if wparam == TIMER_REFRESH {
                refresh_window(hwnd);
                return 0;
            }
        }
        WM_OVERLAY_REFRESH => {
            refresh_window(hwnd);
            return 0;
        }
        WM_DESTROY => {
            return 0;
        }
        _ => {}
    }

    DefWindowProcW(hwnd, message, wparam, lparam)
}

unsafe extern "system" fn win_event_proc(
    _: HWINEVENTHOOK,
    _: u32,
    _: HWND,
    _: i32,
    _: i32,
    _: u32,
    _: u32,
) {
    let thread_id = OVERLAY_THREAD_ID.load(Ordering::SeqCst);
    if thread_id != 0 {
        PostThreadMessageW(thread_id, WM_OVERLAY_REFRESH, 0, 0);
    }
}

unsafe fn refresh_window(hwnd: HWND) {
    let state = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut OverlayThreadState;
    if !state.is_null() {
        (*state).refresh();
    }
}

impl LayeredImage {
    unsafe fn new(image: DecodedImage) -> Option<Self> {
        let screen_dc = GetDC(0 as _);
        if screen_dc == 0 as HDC {
            return None;
        }

        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: image.width,
                biHeight: -image.height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [zeroed()],
        };

        let mut bits: *mut c_void = null_mut();
        let bitmap = CreateDIBSection(screen_dc, &mut info, DIB_RGB_COLORS, &mut bits, 0 as _, 0);
        if bitmap == 0 as HBITMAP || bits.is_null() {
            ReleaseDC(0 as _, screen_dc);
            return None;
        }

        std::ptr::copy_nonoverlapping(image.pixels.as_ptr(), bits as *mut u8, image.pixels.len());
        let hdc = CreateCompatibleDC(screen_dc);
        ReleaseDC(0 as _, screen_dc);
        if hdc == 0 as HDC {
            DeleteObject(bitmap);
            return None;
        }

        let previous = SelectObject(hdc, bitmap as HGDIOBJ);
        if previous == 0 as HGDIOBJ {
            DeleteDC(hdc);
            DeleteObject(bitmap);
            return None;
        }

        Some(Self {
            hdc,
            bitmap,
            previous,
            width: image.width,
            height: image.height,
        })
    }
}

impl Drop for LayeredImage {
    fn drop(&mut self) {
        unsafe {
            SelectObject(self.hdc, self.previous);
            DeleteObject(self.bitmap);
            DeleteDC(self.hdc);
        }
    }
}

impl OverlayThreadState {
    unsafe fn refresh(&mut self) {
        let Some(target_hwnd) = foreground_target_window(&self.target_process_name) else {
            self.hide();
            return;
        };
        let Some((mut x, mut y)) = client_center_position(target_hwnd, self.image.width, self.image.height)
        else {
            self.hide();
            return;
        };
        x += self.offset_x;
        y += self.offset_y;
        self.show_at(x, y);
    }

    unsafe fn show_at(&mut self, x: i32, y: i32) {
        let screen_dc = GetDC(0 as _);
        if screen_dc == 0 as HDC {
            self.hide();
            return;
        }

        let destination = POINT { x, y };
        let source = POINT { x: 0, y: 0 };
        let size = SIZE {
            cx: self.image.width,
            cy: self.image.height,
        };
        let blend = BLENDFUNCTION {
            BlendOp: AC_SRC_OVER as u8,
            BlendFlags: 0,
            SourceConstantAlpha: 255,
            AlphaFormat: AC_SRC_ALPHA as u8,
        };

        let updated = UpdateLayeredWindow(
            self.hwnd,
            screen_dc,
            &destination,
            &size,
            self.image.hdc,
            &source,
            0,
            &blend,
            ULW_ALPHA,
        );
        ReleaseDC(0 as _, screen_dc);

        if updated == 0 {
            self.hide();
            return;
        }

        SetWindowPos(
            self.hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
        ShowWindow(self.hwnd, SW_SHOWNOACTIVATE);
        self.visible = true;
    }

    unsafe fn hide(&mut self) {
        if self.visible {
            ShowWindow(self.hwnd, SW_HIDE);
            self.visible = false;
        }
    }
}

unsafe fn foreground_target_window(target_process_name: &str) -> Option<HWND> {
    let foreground = GetForegroundWindow();
    let root = GetAncestor(foreground, GA_ROOT);
    let hwnd = if root == 0 as HWND { foreground } else { root };
    if hwnd == 0 as HWND || IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
        return None;
    }

    let process_name = window_process_name(hwnd)?;
    if process_name.eq_ignore_ascii_case(target_process_name) {
        Some(hwnd)
    } else {
        None
    }
}

unsafe fn client_center_position(
    hwnd: HWND,
    image_width: i32,
    image_height: i32,
) -> Option<(i32, i32)> {
    let mut rect: RECT = zeroed();
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

unsafe fn window_process_name(hwnd: HWND) -> Option<String> {
    let mut process_id = 0;
    GetWindowThreadProcessId(hwnd, &mut process_id);
    if process_id == 0 {
        return None;
    }

    let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
    if process == 0 as HANDLE {
        return None;
    }

    let mut buffer = [0u16; 1024];
    let mut size = buffer.len() as u32;
    let ok = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut size);
    CloseHandle(process);
    if ok == 0 || size == 0 {
        return None;
    }

    let path = String::from_utf16_lossy(&buffer[..size as usize]);
    path.rsplit('\\').next().map(|name| name.to_string())
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(once(0)).collect()
}

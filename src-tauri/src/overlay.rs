use crate::config::CrosshairConfig;
use crate::state::AppState;
use crate::windows_util::{
    client_center_position, foreground_root_window, is_process_window, ROBLOX_PROCESS,
};
use once_cell::sync::Lazy;
use std::ffi::c_void;
use std::iter::once;
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
use tauri::AppHandle;
use windows_sys::Win32::Foundation::{
    CloseHandle, HANDLE, HWND, LPARAM, LRESULT, POINT, SIZE, WAIT_FAILED, WAIT_OBJECT_0, WAIT_TIMEOUT, WPARAM,
};
use windows_sys::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC, SelectObject,
    AC_SRC_ALPHA, AC_SRC_OVER, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION, DIB_RGB_COLORS,
    HBITMAP, HDC, HGDIOBJ,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::{CreateEventW, GetCurrentThreadId, SetEvent};
use windows_sys::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows_sys::Win32::UI::HiDpi::{
    SetProcessDpiAwarenessContext, SetThreadDpiAwarenessContext,
    DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetWindowLongPtrW, KillTimer,
    MsgWaitForMultipleObjects, PeekMessageW, PostMessageW, PostThreadMessageW, RegisterClassExW,
    SetTimer, SetWindowLongPtrW, SetWindowPos, ShowWindow, TranslateMessage, UpdateLayeredWindow,
    CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, EVENT_OBJECT_LOCATIONCHANGE, EVENT_SYSTEM_FOREGROUND,
    GWLP_USERDATA, HWND_TOPMOST, MSG, PM_REMOVE, QS_ALLINPUT, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOSIZE, SW_HIDE, SW_SHOWNOACTIVATE, ULW_ALPHA, WINEVENT_OUTOFCONTEXT,
    WINEVENT_SKIPOWNPROCESS, WM_APP, WM_DESTROY, WM_QUIT, WM_TIMER, WNDCLASSEXW, WS_EX_LAYERED,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};

const CLASS_NAME: &str = "VBLProTauriCrosshairOverlayWindow";
const WINDOW_NAME: &str = "VBLProTauriCrosshairOverlay";
const TIMER_REFRESH: usize = 1;
const WM_OVERLAY_REFRESH: u32 = WM_APP + 41;
const CROSSHAIR_IMAGE: &[u8] = include_bytes!("../../assets/crosshair.png");

struct OverlayHandle {
    stop_event: isize,
    thread: JoinHandle<()>,
}

struct DecodedFrame {
    width: i32,
    height: i32,
    pixels: Vec<u8>,
    delay_ms: u32,
}

struct LayeredFrame {
    bitmap: HBITMAP,
    delay_ms: u32,
}

struct LayeredImage {
    hdc: HDC,
    original_bitmap: HGDIOBJ,
    frames: Vec<LayeredFrame>,
    width: i32,
    height: i32,
    opacity: u8,
}

struct OverlayThreadState {
    hwnd: HWND,
    image: Option<LayeredImage>,
    seen_config_version: u64,
    app_state: AppState,
    app: AppHandle,
    visible: bool,
    current_frame: usize,
    last_frame_time: std::time::Instant,
}

unsafe impl Send for OverlayHandle {}
unsafe impl Send for OverlayThreadState {}

static OVERLAY: Lazy<Mutex<Option<OverlayHandle>>> = Lazy::new(|| Mutex::new(None));
static OVERLAY_HWND: AtomicIsize = AtomicIsize::new(0);

pub fn start(state: AppState, app: AppHandle) {
    if state.runtime().overlay_running.swap(true, Ordering::SeqCst) {
        request_refresh();
        return;
    }

    cleanup_finished();

    let stop_event = unsafe { CreateEventW(null(), 1, 0, null()) };
    if stop_event.is_null() {
        state
            .runtime()
            .overlay_running
            .store(false, Ordering::SeqCst);
        state
            .runtime()
            .push_error(&app, "Failed to create overlay stop event");
        return;
    }

    let stop_event_value = stop_event as isize;
    let thread_state = state.clone();
    let thread_app = app.clone();
    let thread = thread::Builder::new()
        .name("vbl-pro-overlay".to_string())
        .spawn(move || unsafe {
            run_overlay_thread(thread_state, thread_app, stop_event_value as HANDLE);
        });

    match thread {
        Ok(thread) => {
            if let Ok(mut guard) = OVERLAY.lock() {
                *guard = Some(OverlayHandle {
                    stop_event: stop_event_value,
                    thread,
                });
            }
            state.runtime().push_log(&app, "Overlay started");
        }
        Err(err) => {
            unsafe {
                CloseHandle(stop_event);
            }
            state
                .runtime()
                .overlay_running
                .store(false, Ordering::SeqCst);
            state
                .runtime()
                .push_error(&app, format!("Failed to spawn overlay: {err}"));
        }
    }
}

pub fn stop(state: &AppState) {
    let handle = if let Ok(mut guard) = OVERLAY.lock() {
        guard.take()
    } else {
        None
    };

    if let Some(handle) = handle {
        unsafe {
            SetEvent(handle.stop_event as HANDLE);
        }
        let thread_id = state.runtime().overlay_thread_id.load(Ordering::SeqCst);
        if thread_id != 0 {
            unsafe {
                PostThreadMessageW(thread_id, WM_QUIT, 0, 0);
            }
        }
        let _ = handle.thread.join();
        unsafe {
            CloseHandle(handle.stop_event as HANDLE);
        }
    }

    state
        .runtime()
        .overlay_running
        .store(false, Ordering::SeqCst);
}

pub fn request_refresh() {
    let hwnd = OVERLAY_HWND.load(Ordering::SeqCst);
    if hwnd != 0 {
        unsafe {
            PostMessageW(hwnd as HWND, WM_OVERLAY_REFRESH, 0, 0);
        }
    }
}

fn cleanup_finished() {
    if let Ok(mut guard) = OVERLAY.lock() {
        let finished = guard
            .as_ref()
            .map(|handle| handle.thread.is_finished())
            .unwrap_or(false);
        if finished {
            if let Some(handle) = guard.take() {
                let _ = handle.thread.join();
                unsafe {
                    CloseHandle(handle.stop_event as HANDLE);
                }
            }
        }
    }
}

unsafe fn run_overlay_thread(state: AppState, app: AppHandle, stop_event: HANDLE) {
    let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    let _ = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    let class_name = wide(CLASS_NAME);
    let window_name = wide(WINDOW_NAME);
    let instance = GetModuleHandleW(null());
    let window_class = WNDCLASSEXW {
        cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(window_proc),
        cbClsExtra: 0,
        cbWndExtra: 0,
        hInstance: instance,
        hIcon: null_mut(),
        hCursor: null_mut(),
        hbrBackground: null_mut(),
        lpszMenuName: null(),
        lpszClassName: class_name.as_ptr(),
        hIconSm: null_mut(),
    };
    RegisterClassExW(&window_class);

    let hwnd = CreateWindowExW(
        WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_NOACTIVATE,
        class_name.as_ptr(),
        window_name.as_ptr(),
        WS_POPUP,
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        1,
        1,
        null_mut(),
        null_mut(),
        instance,
        null_mut(),
    );

    if hwnd.is_null() {
        state
            .runtime()
            .overlay_running
            .store(false, Ordering::SeqCst);
        state
            .runtime()
            .push_error(&app, "Failed to create overlay window");
        return;
    }

    let overlay_state = Box::new(OverlayThreadState {
        hwnd,
        image: None,
        seen_config_version: 0,
        app_state: state.clone(),
        app: app.clone(),
        visible: false,
        current_frame: 0,
        last_frame_time: std::time::Instant::now(),
    });
    let state_ptr = Box::into_raw(overlay_state);
    SetWindowLongPtrW(hwnd, GWLP_USERDATA, state_ptr as isize);
    OVERLAY_HWND.store(hwnd as isize, Ordering::SeqCst);
    state
        .runtime()
        .overlay_thread_id
        .store(GetCurrentThreadId(), Ordering::SeqCst);
    SetTimer(hwnd, TIMER_REFRESH, 100, None);

    let foreground_hook = SetWinEventHook(
        EVENT_SYSTEM_FOREGROUND,
        EVENT_SYSTEM_FOREGROUND,
        null_mut(),
        Some(win_event_proc),
        0,
        0,
        WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
    );
    let location_hook = SetWinEventHook(
        EVENT_OBJECT_LOCATIONCHANGE,
        EVENT_OBJECT_LOCATIONCHANGE,
        null_mut(),
        Some(win_event_proc),
        0,
        0,
        WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
    );

    refresh_window(hwnd);
    message_loop(stop_event, hwnd);

    if !foreground_hook.is_null() {
        UnhookWinEvent(foreground_hook);
    }
    if !location_hook.is_null() {
        UnhookWinEvent(location_hook);
    }

    OVERLAY_HWND.store(0, Ordering::SeqCst);
    state.runtime().overlay_thread_id.store(0, Ordering::SeqCst);
    state
        .runtime()
        .overlay_running
        .store(false, Ordering::SeqCst);
    KillTimer(hwnd, TIMER_REFRESH);
    ShowWindow(hwnd, SW_HIDE);
    SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
    DestroyWindow(hwnd);
    drop(Box::from_raw(state_ptr));
    state.runtime().emit_status(&app);
}

unsafe fn message_loop(stop_event: HANDLE, hwnd: HWND) {
    let handles = [stop_event];
    loop {
        let mut wait_time = 100;
        let state = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut OverlayThreadState;
        if !state.is_null() {
            let s = &mut *state;
            if let Some(image) = s.image.as_ref() {
                if !image.frames.is_empty() {
                    let frame_count = image.frames.len();
                    if frame_count > 1 {
                        let frame = &image.frames[s.current_frame % frame_count];
                        let elapsed = s.last_frame_time.elapsed().as_millis() as u32;
                        if elapsed >= frame.delay_ms {
                            s.current_frame = (s.current_frame + 1) % frame_count;
                            s.last_frame_time = std::time::Instant::now();
                            s.refresh();
                        } else {
                            wait_time = wait_time.min(frame.delay_ms - elapsed);
                        }
                    }
                }
            }
        }

        let wait = MsgWaitForMultipleObjects(1, handles.as_ptr(), 0, wait_time, QS_ALLINPUT);
        if wait == WAIT_OBJECT_0 || wait == WAIT_FAILED {
            break;
        }

        if wait == WAIT_TIMEOUT {
            refresh_window(hwnd);
        }

        let mut message: MSG = std::mem::zeroed();
        while PeekMessageW(&mut message, null_mut(), 0, 0, PM_REMOVE) != 0 {
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
    request_refresh();
}

unsafe fn refresh_window(hwnd: HWND) {
    let state = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut OverlayThreadState;
    if !state.is_null() {
        (*state).refresh();
    }
}

impl OverlayThreadState {
    unsafe fn refresh(&mut self) {
        if !self
            .app_state
            .runtime()
            .runtime_enabled
            .load(Ordering::SeqCst)
        {
            self.hide();
            return;
        }

        let config = match self.app_state.config() {
            Ok(config) => config,
            Err(err) => {
                self.app_state.runtime().push_error(&self.app, err);
                self.hide();
                return;
            }
        };

        if !config.crosshair.enabled {
            self.hide();
            return;
        }

        let version = self.app_state.config_version();
        if self.image.is_none() || self.seen_config_version != version {
            match LayeredImage::from_config(&config.crosshair) {
                Some(image) => {
                    self.image = Some(image);
                    self.seen_config_version = version;
                }
                None => {
                    self.hide();
                    return;
                }
            }
        }

        let Some(image) = self.image.as_ref() else {
            self.hide();
            return;
        };

        let mut target = self
            .app_state
            .runtime()
            .last_roblox_hwnd
            .load(Ordering::SeqCst) as HWND;
        if target.is_null() {
            let foreground = foreground_root_window();
            if is_process_window(foreground, ROBLOX_PROCESS) {
                self.app_state
                    .runtime()
                    .last_roblox_hwnd
                    .store(foreground as isize, Ordering::SeqCst);
                target = foreground;
            }
        }

        if !is_process_window(target, ROBLOX_PROCESS) {
            self.hide();
            return;
        }

        let foreground = foreground_root_window();
        let roblox_focused = is_process_window(foreground, ROBLOX_PROCESS);

        if !roblox_focused {
            self.hide();
            return;
        }

        let Some((mut x, mut y)) = client_center_position(target, image.width, image.height) else {
            self.hide();
            return;
        };
        x += config.crosshair.offset.x;
        y += config.crosshair.offset.y;
        self.show_at(x, y);
    }

    unsafe fn show_at(&mut self, x: i32, y: i32) {
        let Some(image) = self.image.as_ref() else {
            self.hide();
            return;
        };

        if image.frames.is_empty() {
            self.hide();
            return;
        }

        let frame_index = self.current_frame % image.frames.len();
        let frame = &image.frames[frame_index];
        SelectObject(image.hdc, frame.bitmap);

        let screen_dc = GetDC(null_mut());
        if screen_dc.is_null() {
            self.hide();
            return;
        }

        let destination = POINT { x, y };
        let source = POINT { x: 0, y: 0 };
        let size = SIZE {
            cx: image.width,
            cy: image.height,
        };
        let blend = BLENDFUNCTION {
            BlendOp: AC_SRC_OVER as u8,
            BlendFlags: 0,
            SourceConstantAlpha: image.opacity,
            AlphaFormat: AC_SRC_ALPHA as u8,
        };

        let updated = UpdateLayeredWindow(
            self.hwnd,
            screen_dc,
            &destination,
            &size,
            image.hdc,
            &source,
            0,
            &blend,
            ULW_ALPHA,
        );
        ReleaseDC(null_mut(), screen_dc);

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

impl LayeredImage {
    unsafe fn from_config(config: &CrosshairConfig) -> Option<Self> {
        let decoded_frames = decode_image(config)?;
        if decoded_frames.is_empty() { return None; }
        
        let screen_dc = GetDC(null_mut());
        if screen_dc.is_null() { return None; }
        
        let hdc = CreateCompatibleDC(screen_dc);
        if hdc.is_null() {
            ReleaseDC(null_mut(), screen_dc);
            return None;
        }

        let width = decoded_frames[0].width;
        let height = decoded_frames[0].height;
        let mut original_bitmap = null_mut();
        let mut frames = Vec::new();

        for (i, decoded) in decoded_frames.into_iter().enumerate() {
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: decoded.width,
                    biHeight: -decoded.height,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB,
                    biSizeImage: 0,
                    biXPelsPerMeter: 0,
                    biYPelsPerMeter: 0,
                    biClrUsed: 0,
                    biClrImportant: 0,
                },
                bmiColors: [std::mem::zeroed()],
            };

            let mut bits: *mut c_void = null_mut();
            let bitmap = CreateDIBSection(
                screen_dc,
                &mut info,
                DIB_RGB_COLORS,
                &mut bits,
                null_mut(),
                0,
            );
            
            if !bitmap.is_null() && !bits.is_null() {
                std::ptr::copy_nonoverlapping(decoded.pixels.as_ptr(), bits as *mut u8, decoded.pixels.len());
                if i == 0 {
                    original_bitmap = SelectObject(hdc, bitmap);
                }
                frames.push(LayeredFrame {
                    bitmap,
                    delay_ms: decoded.delay_ms,
                });
            }
        }

        ReleaseDC(null_mut(), screen_dc);

        if frames.is_empty() || original_bitmap.is_null() {
            DeleteDC(hdc);
            for f in frames { DeleteObject(f.bitmap); }
            return None;
        }

        Some(Self {
            hdc,
            original_bitmap,
            frames,
            width,
            height,
            opacity: (config.opacity.clamp(0.0, 1.0) * 255.0).round() as u8,
        })
    }
}

impl Drop for LayeredImage {
    fn drop(&mut self) {
        unsafe {
            SelectObject(self.hdc, self.original_bitmap);
            for frame in &self.frames {
                DeleteObject(frame.bitmap);
            }
            DeleteDC(self.hdc);
        }
    }
}

use std::io::Cursor;
use image::AnimationDecoder;
use image::codecs::gif::GifDecoder;

fn process_rgba(rgba: &image::RgbaImage, config: &CrosshairConfig, tint: [u8; 3]) -> Option<DecodedFrame> {
    let resized;
    let img_ref = if config.scale > 0.0 && (config.scale - 1.0).abs() > f64::EPSILON {
        let width = ((rgba.width() as f64 * config.scale).round() as u32).max(1);
        let height = ((rgba.height() as f64 * config.scale).round() as u32).max(1);
        resized = image::imageops::resize(rgba, width, height, image::imageops::FilterType::Nearest);
        &resized
    } else {
        rgba
    };

    let (width, height) = img_ref.dimensions();
    if width == 0 || height == 0 || width > i32::MAX as u32 || height > i32::MAX as u32 {
        return None;
    }

    let mut pixels = Vec::with_capacity((width * height * 4) as usize);
    for pixel in img_ref.pixels() {
        let r = ((pixel.0[0] as u16 * tint[0] as u16) / 255) as u8;
        let g = ((pixel.0[1] as u16 * tint[1] as u16) / 255) as u8;
        let b = ((pixel.0[2] as u16 * tint[2] as u16) / 255) as u8;
        let a = pixel.0[3];
        pixels.push(premultiply(b, a));
        pixels.push(premultiply(g, a));
        pixels.push(premultiply(r, a));
        pixels.push(a);
    }

    Some(DecodedFrame {
        width: width as i32,
        height: height as i32,
        pixels,
        delay_ms: 100, // placeholder, will be set by caller
    })
}

fn decode_image(config: &CrosshairConfig) -> Option<Vec<DecodedFrame>> {
    let bytes = match config.custom_image.as_ref() {
        Some(path) => std::fs::read(path).ok().unwrap_or_else(|| CROSSHAIR_IMAGE.to_vec()),
        None => CROSSHAIR_IMAGE.to_vec(),
    };

    let mut frames = Vec::new();
    let tint = parse_hex_color(&config.color).unwrap_or([255, 255, 255]);

    if let Ok(decoder) = GifDecoder::new(Cursor::new(&bytes)) {
        if let Ok(animation_frames) = decoder.into_frames().collect::<Result<Vec<_>, _>>() {
            for frame in animation_frames {
                let delay_ms = {
                    let (num, den) = frame.delay().numer_denom_ms();
                    if den > 0 { (num / den) as u32 } else { 0 }
                };
                let rgba = frame.into_buffer();
                if let Some(mut decoded) = process_rgba(&rgba, config, tint) {
                    decoded.delay_ms = delay_ms.max(10);
                    frames.push(decoded);
                }
            }
        }
    }

    if frames.is_empty() {
        if let Ok(img) = image::load_from_memory(&bytes) {
            let rgba = img.to_rgba8();
            if let Some(mut decoded) = process_rgba(&rgba, config, tint) {
                decoded.delay_ms = u32::MAX;
                frames.push(decoded);
            }
        }
    }

    if frames.is_empty() {
        None
    } else {
        Some(frames)
    }
}

fn parse_hex_color(hex: &str) -> Option<[u8; 3]> {
    let value = hex.trim_start_matches('#');
    if value.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&value[0..2], 16).ok()?;
    let g = u8::from_str_radix(&value[2..4], 16).ok()?;
    let b = u8::from_str_radix(&value[4..6], 16).ok()?;
    Some([r, g, b])
}

fn premultiply(color: u8, alpha: u8) -> u8 {
    (((color as u16 * alpha as u16) + 127) / 255) as u8
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(once(0)).collect()
}

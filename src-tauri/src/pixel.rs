use crate::config::{PixelConfig, ResolutionConfig, StateKey};
use crate::state::AppState;
use crate::windows_util::screen_size;
use std::ffi::c_void;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;
use tauri::AppHandle;
use windows_sys::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC,
    SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ,
    RGBQUAD, SRCCOPY,
};

struct PreparedConfig {
    key: StateKey,
    x: i32,
    y: i32,
    min_r: i32,
    max_r: i32,
    min_g: i32,
    max_g: i32,
    min_b: i32,
    max_b: i32,
}

struct CaptureRegion {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

struct ScreenCapture {
    screen_dc: HDC,
    memory_dc: HDC,
    bitmap: HBITMAP,
    old_object: HGDIOBJ,
    bits: *mut u8,
    width: i32,
    height: i32,
}

pub fn start(state: AppState, app: AppHandle) {
    if state
        .runtime()
        .pixel_scanner_running
        .swap(true, Ordering::SeqCst)
    {
        return;
    }

    let thread_state = state.clone();
    let thread_app = app.clone();
    let thread = thread::Builder::new()
        .name("vbl-pro-pixel".to_string())
        .spawn(move || {
            run_scanner(thread_state, thread_app);
        });

    if let Err(err) = thread {
        state
            .runtime()
            .pixel_scanner_running
            .store(false, Ordering::SeqCst);
        state
            .runtime()
            .push_error(&app, format!("Failed to spawn pixel scanner: {err}"));
    }
}

fn run_scanner(state: AppState, app: AppHandle) {
    let mut current_width = 0;
    let mut current_height = 0;
    let mut ticks_since_check = 100;
    let mut seen_config_version = 0;
    let mut current_configs: Vec<PreparedConfig> = Vec::new();
    let mut capture_region: Option<CaptureRegion> = None;
    let mut screen_capture: Option<ScreenCapture> = None;
    let mut last_match = false;

    while state.runtime().runtime_enabled.load(Ordering::SeqCst) {
        ticks_since_check += 1;
        let config_version = state.config_version();
        let config_changed = config_version != seen_config_version;

        if ticks_since_check >= 100 || config_changed {
            ticks_since_check = 0;
            let (width, height) = unsafe { screen_size() };
            let needs_rebuild = width != current_width
                || height != current_height
                || config_changed
                || capture_region.is_none();
            seen_config_version = config_version;
            current_width = width;
            current_height = height;

            if needs_rebuild {
                let entry = state.config().ok().and_then(|config| {
                    config
                        .watcher
                        .resolutions
                        .into_iter()
                        .find(|item| item.width == width && item.height == height)
                });

                if let Some(entry) = entry {
                    current_configs = prepare_configs(&entry);
                    capture_region = compute_capture_region(&current_configs);
                    screen_capture = capture_region.as_ref().and_then(|region| unsafe {
                        ScreenCapture::new(region.width, region.height)
                    });
                    if !last_match {
                        state
                            .runtime()
                            .push_log(&app, format!("Resolution matched: {width}x{height}"));
                    }
                    last_match = true;
                    state.runtime().set_resolution(width, height, true, &app);
                } else {
                    current_configs.clear();
                    capture_region = None;
                    screen_capture = None;
                    if last_match || width != 0 || height != 0 {
                        state
                            .runtime()
                            .push_log(&app, format!("No watcher config for {width}x{height}"));
                    }
                    last_match = false;
                    state.runtime().set_resolution(width, height, false, &app);
                }
            }
        }

        if let (Some(region), Some(capture)) = (&capture_region, &screen_capture) {
            unsafe {
                if capture.refresh(region.x, region.y) {
                    for config in &current_configs {
                        if let Some((r, g, b)) =
                            capture.rgb_at(config.x - region.x, config.y - region.y)
                        {
                            let matches = r >= config.min_r
                                && r <= config.max_r
                                && g >= config.min_g
                                && g <= config.max_g
                                && b >= config.min_b
                                && b <= config.max_b;
                            state.runtime().set_state(config.key.clone(), matches, &app);
                        }
                    }
                }
            }
        }

        thread::sleep(Duration::from_millis(10));
    }

    state
        .runtime()
        .pixel_scanner_running
        .store(false, Ordering::SeqCst);
    state.runtime().emit_status(&app);
}

pub fn stop(_: &AppState) {}

fn prepare_configs(entry: &ResolutionConfig) -> Vec<PreparedConfig> {
    entry.configs.iter().map(prepare_config).collect()
}

fn prepare_config(config: &PixelConfig) -> PreparedConfig {
    let [x, y] = config.point;
    let [r, g, b] = config.target;
    let tolerance = config.tolerance;
    PreparedConfig {
        key: config.key.clone(),
        x,
        y,
        min_r: clamp_color(r - tolerance),
        max_r: clamp_color(r + tolerance),
        min_g: clamp_color(g - tolerance),
        max_g: clamp_color(g + tolerance),
        min_b: clamp_color(b - tolerance),
        max_b: clamp_color(b + tolerance),
    }
}

fn clamp_color(value: i32) -> i32 {
    value.clamp(0, 255)
}

fn compute_capture_region(configs: &[PreparedConfig]) -> Option<CaptureRegion> {
    let first = configs.first()?;
    let mut min_x = first.x;
    let mut max_x = first.x;
    let mut min_y = first.y;
    let mut max_y = first.y;

    for config in configs.iter().skip(1) {
        min_x = min_x.min(config.x);
        max_x = max_x.max(config.x);
        min_y = min_y.min(config.y);
        max_y = max_y.max(config.y);
    }

    Some(CaptureRegion {
        x: min_x,
        y: min_y,
        width: max_x - min_x + 1,
        height: max_y - min_y + 1,
    })
}

impl ScreenCapture {
    unsafe fn new(width: i32, height: i32) -> Option<Self> {
        if width <= 0 || height <= 0 {
            return None;
        }

        let screen_dc = GetDC(std::ptr::null_mut());
        if screen_dc.is_null() {
            return None;
        }

        let memory_dc = CreateCompatibleDC(screen_dc);
        if memory_dc.is_null() {
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return None;
        }

        let mut bits: *mut c_void = std::ptr::null_mut();
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                biSizeImage: (width * height * 4) as u32,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD {
                rgbBlue: 0,
                rgbGreen: 0,
                rgbRed: 0,
                rgbReserved: 0,
            }],
        };

        let bitmap = CreateDIBSection(
            screen_dc,
            &mut info,
            DIB_RGB_COLORS,
            &mut bits,
            std::ptr::null_mut(),
            0,
        );

        if bitmap.is_null() || bits.is_null() {
            if !bitmap.is_null() {
                DeleteObject(bitmap);
            }
            DeleteDC(memory_dc);
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return None;
        }

        let old_object = SelectObject(memory_dc, bitmap);
        if old_object.is_null() {
            DeleteObject(bitmap);
            DeleteDC(memory_dc);
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return None;
        }

        Some(Self {
            screen_dc,
            memory_dc,
            bitmap,
            old_object,
            bits: bits.cast(),
            width,
            height,
        })
    }

    unsafe fn refresh(&self, x: i32, y: i32) -> bool {
        BitBlt(
            self.memory_dc,
            0,
            0,
            self.width,
            self.height,
            self.screen_dc,
            x,
            y,
            SRCCOPY,
        ) != 0
    }

    unsafe fn rgb_at(&self, x: i32, y: i32) -> Option<(i32, i32, i32)> {
        if x < 0 || y < 0 || x >= self.width || y >= self.height {
            return None;
        }
        let index = ((y * self.width + x) * 4) as usize;
        let b = *self.bits.add(index) as i32;
        let g = *self.bits.add(index + 1) as i32;
        let r = *self.bits.add(index + 2) as i32;
        Some((r, g, b))
    }
}

impl Drop for ScreenCapture {
    fn drop(&mut self) {
        unsafe {
            SelectObject(self.memory_dc, self.old_object);
            DeleteObject(self.bitmap);
            DeleteDC(self.memory_dc);
            ReleaseDC(std::ptr::null_mut(), self.screen_dc);
        }
    }
}

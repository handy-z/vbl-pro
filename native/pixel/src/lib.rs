use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;
use serde::Deserialize;

use windows_sys::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject, BITMAPINFO,
    BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ, RGBQUAD, SRCCOPY,
};
use windows_sys::Win32::Graphics::Gdi::{GetDC, ReleaseDC};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

#[derive(Deserialize, Debug)]
struct PixelConfig {
    slot: usize,
    point: (i32, i32),
    target: (i32, i32, i32),
    tolerance: i32,
}

#[derive(Deserialize, Debug)]
struct ResolutionEntry {
    width: i32,
    height: i32,
    configs: Vec<PixelConfig>,
}

struct PreparedConfig {
    slot: usize,
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

impl ScreenCapture {
    unsafe fn new(width: i32, height: i32) -> Option<Self> {
        let screen_dc = GetDC(std::ptr::null_mut());
        if screen_dc.is_null() {
            return None;
        }

        let memory_dc = CreateCompatibleDC(screen_dc);
        if memory_dc.is_null() {
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return None;
        }

        let mut bits = std::ptr::null_mut();
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

        let idx = ((y * self.width + x) * 4) as usize;
        let b = *self.bits.add(idx) as i32;
        let g = *self.bits.add(idx + 1) as i32;
        let r = *self.bits.add(idx + 2) as i32;
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

fn clamp_color(v: i32) -> i32 {
    v.clamp(0, 255)
}

fn prepare_configs(entry: &ResolutionEntry) -> Vec<PreparedConfig> {
    entry
        .configs
        .iter()
        .map(|cfg| {
            let (x, y) = cfg.point;
            let (r, g, b) = cfg.target;
            let tol = cfg.tolerance;
            PreparedConfig {
                slot: cfg.slot,
                x,
                y,
                min_r: clamp_color(r - tol),
                max_r: clamp_color(r + tol),
                min_g: clamp_color(g - tol),
                max_g: clamp_color(g + tol),
                min_b: clamp_color(b - tol),
                max_b: clamp_color(b + tol),
            }
        })
        .collect()
}

fn compute_capture_region(configs: &[PreparedConfig]) -> Option<CaptureRegion> {
    let first = configs.first()?;
    let mut min_x = first.x;
    let mut max_x = first.x;
    let mut min_y = first.y;
    let mut max_y = first.y;

    for cfg in configs.iter().skip(1) {
        min_x = min_x.min(cfg.x);
        max_x = max_x.max(cfg.x);
        min_y = min_y.min(cfg.y);
        max_y = max_y.max(cfg.y);
    }

    Some(CaptureRegion {
        x: min_x,
        y: min_y,
        width: max_x - min_x + 1,
        height: max_y - min_y + 1,
    })
}

static STOP_FLAG: AtomicBool = AtomicBool::new(false);
static IS_RUNNING: AtomicBool = AtomicBool::new(false);

#[napi(
    ts_args_type = "sab: Int32Array, configsJson: string, callback: (err: any, json: string) => void"
)]
pub fn start_scanner(
    mut sab: Int32Array,
    configs_json: String,
    callback: ThreadsafeFunction<String>,
) -> Result<()> {
    if IS_RUNNING.load(Ordering::SeqCst) {
        return Ok(());
    }

    let resolutions: Vec<ResolutionEntry> = serde_json::from_str(&configs_json)
        .map_err(|e| Error::new(Status::InvalidArg, e.to_string()))?;

    let sab_ptr = unsafe { sab.as_mut().as_mut_ptr() as usize };

    STOP_FLAG.store(false, Ordering::SeqCst);
    IS_RUNNING.store(true, Ordering::SeqCst);

    thread::spawn(move || {
        let mut cur_w = 0;
        let mut cur_h = 0;
        let mut ticks_since_check = 100;
        let mut current_configs: Option<Vec<PreparedConfig>> = None;
        let mut capture_region: Option<CaptureRegion> = None;
        let mut screen_capture: Option<ScreenCapture> = None;

        while !STOP_FLAG.load(Ordering::SeqCst) {
            ticks_since_check += 1;

            if ticks_since_check >= 100 {
                ticks_since_check = 0;
                let new_w = unsafe { GetSystemMetrics(SM_CXSCREEN) };
                let new_h = unsafe { GetSystemMetrics(SM_CYSCREEN) };

                if new_w != cur_w || new_h != cur_h {
                    cur_w = new_w;
                    cur_h = new_h;

                    if let Some(entry) = resolutions
                        .iter()
                        .find(|r| r.width == cur_w && r.height == cur_h)
                    {
                        let prepared = prepare_configs(entry);
                        capture_region = compute_capture_region(&prepared);
                        screen_capture = capture_region.as_ref().and_then(|region| unsafe {
                            ScreenCapture::new(region.width, region.height)
                        });
                        current_configs = Some(prepared);
                        let msg = format!(
                            r#"{{"type":"resolution","width":{},"height":{}}}"#,
                            cur_w, cur_h
                        );
                        callback.call(Ok(msg), ThreadsafeFunctionCallMode::NonBlocking);
                    } else {
                        current_configs = None;
                        capture_region = None;
                        screen_capture = None;
                        let msg = format!(
                            r#"{{"type":"resolution_missing","width":{},"height":{}}}"#,
                            cur_w, cur_h
                        );
                        callback.call(Ok(msg), ThreadsafeFunctionCallMode::NonBlocking);
                    }
                }
            }

            if let (Some(ref configs), Some(ref region), Some(ref capture)) =
                (&current_configs, &capture_region, &screen_capture)
            {
                unsafe {
                    if capture.refresh(region.x, region.y) {
                        let ptr = sab_ptr as *mut i32;
                        for cfg in configs {
                            if let Some((r, g, b)) =
                                capture.rgb_at(cfg.x - region.x, cfg.y - region.y)
                            {
                                let matches = r >= cfg.min_r
                                    && r <= cfg.max_r
                                    && g >= cfg.min_g
                                    && g <= cfg.max_g
                                    && b >= cfg.min_b
                                    && b <= cfg.max_b;

                                let val = if matches { 1 } else { 0 };
                                std::ptr::write_volatile(ptr.add(cfg.slot), val);
                            }
                        }
                    }
                }
            }

            thread::sleep(std::time::Duration::from_millis(10));
        }

        IS_RUNNING.store(false, Ordering::SeqCst);
    });

    Ok(())
}

#[napi]
pub fn stop_scanner() {
    STOP_FLAG.store(true, Ordering::SeqCst);
}

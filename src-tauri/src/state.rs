use crate::config::{AppConfig, StateKey};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicIsize, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

pub struct AppStateInner {
    pub config: Mutex<AppConfig>,
    pub config_path: PathBuf,
    pub runtime: RuntimeShared,
    pub config_version: AtomicU64,
    pub save_generation: AtomicU64,
}

pub struct RuntimeShared {
    pub runtime_enabled: AtomicBool,
    pub focus_monitor_running: AtomicBool,
    pub pixel_scanner_running: AtomicBool,
    pub input_hook_running: AtomicBool,
    pub overlay_running: AtomicBool,
    pub game_on_ground: AtomicBool,
    pub game_skill_ready: AtomicBool,
    pub x1_held: AtomicBool,
    pub x2_held: AtomicBool,
    pub skill_enabled: AtomicBool,
    pub roblox_focused: AtomicBool,
    pub current_resolution_width: AtomicI32,
    pub current_resolution_height: AtomicI32,
    pub watcher_matched: AtomicBool,
    pub last_roblox_hwnd: AtomicIsize,
    pub app_hwnd: AtomicIsize,
    pub focus_thread_id: AtomicU32,
    pub input_thread_id: AtomicU32,
    pub overlay_thread_id: AtomicU32,
    pub last_error: Mutex<Option<String>>,
    pub logs: Mutex<Vec<String>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub runtime_enabled: bool,
    pub roblox_focused: bool,
    pub focus_monitor_running: bool,
    pub pixel_scanner_running: bool,
    pub input_hook_running: bool,
    pub overlay_running: bool,
    pub current_resolution: Option<ResolutionStatus>,
    pub watcher_matched: bool,
    pub state: RuntimeValues,
    pub last_error: Option<String>,
    pub logs: Vec<String>,
}

#[derive(Clone, Serialize)]
pub struct RuntimeValues {
    #[serde(rename = "GameOnGround")]
    pub game_on_ground: bool,
    #[serde(rename = "GameSkillReady")]
    pub game_skill_ready: bool,
    #[serde(rename = "X1Held")]
    pub x1_held: bool,
    #[serde(rename = "X2Held")]
    pub x2_held: bool,
    #[serde(rename = "skillEnabled")]
    pub skill_enabled: bool,
    #[serde(rename = "robloxFocused")]
    pub roblox_focused: bool,
}

#[derive(Clone, Serialize)]
pub struct ResolutionStatus {
    pub width: i32,
    pub height: i32,
}

impl AppState {
    pub fn new(config: AppConfig, config_path: PathBuf) -> Self {
        Self {
            inner: Arc::new(AppStateInner {
                config: Mutex::new(config),
                config_path,
                runtime: RuntimeShared::new(),
                config_version: AtomicU64::new(1),
                save_generation: AtomicU64::new(0),
            }),
        }
    }

    pub fn config(&self) -> Result<AppConfig, String> {
        self.inner
            .config
            .lock()
            .map(|guard| guard.clone())
            .map_err(|_| "Config lock failed".to_string())
    }

    pub fn with_config<T>(&self, callback: impl FnOnce(&mut AppConfig) -> T) -> Result<T, String> {
        let mut guard = self
            .inner
            .config
            .lock()
            .map_err(|_| "Config lock failed".to_string())?;
        Ok(callback(&mut guard))
    }

    pub fn runtime(&self) -> &RuntimeShared {
        &self.inner.runtime
    }

    pub fn config_path(&self) -> PathBuf {
        self.inner.config_path.clone()
    }

    pub fn config_version(&self) -> u64 {
        self.inner.config_version.load(Ordering::SeqCst)
    }

    pub fn bump_config_version(&self) -> u64 {
        self.inner.config_version.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn next_save_generation(&self) -> u64 {
        self.inner.save_generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn save_generation(&self) -> u64 {
        self.inner.save_generation.load(Ordering::SeqCst)
    }
}

impl RuntimeShared {
    pub fn new() -> Self {
        Self {
            runtime_enabled: AtomicBool::new(false),
            focus_monitor_running: AtomicBool::new(false),
            pixel_scanner_running: AtomicBool::new(false),
            input_hook_running: AtomicBool::new(false),
            overlay_running: AtomicBool::new(false),
            game_on_ground: AtomicBool::new(false),
            game_skill_ready: AtomicBool::new(false),
            x1_held: AtomicBool::new(false),
            x2_held: AtomicBool::new(false),
            skill_enabled: AtomicBool::new(true),
            roblox_focused: AtomicBool::new(false),
            current_resolution_width: AtomicI32::new(0),
            current_resolution_height: AtomicI32::new(0),
            watcher_matched: AtomicBool::new(false),
            last_roblox_hwnd: AtomicIsize::new(0),
            app_hwnd: AtomicIsize::new(0),
            focus_thread_id: AtomicU32::new(0),
            input_thread_id: AtomicU32::new(0),
            overlay_thread_id: AtomicU32::new(0),
            last_error: Mutex::new(None),
            logs: Mutex::new(Vec::new()),
        }
    }

    pub fn snapshot(&self) -> RuntimeStatus {
        let width = self.current_resolution_width.load(Ordering::SeqCst);
        let height = self.current_resolution_height.load(Ordering::SeqCst);
        let current_resolution = if width > 0 && height > 0 {
            Some(ResolutionStatus { width, height })
        } else {
            None
        };
        RuntimeStatus {
            runtime_enabled: self.runtime_enabled.load(Ordering::SeqCst),
            roblox_focused: self.roblox_focused.load(Ordering::SeqCst),
            focus_monitor_running: self.focus_monitor_running.load(Ordering::SeqCst),
            pixel_scanner_running: self.pixel_scanner_running.load(Ordering::SeqCst),
            input_hook_running: self.input_hook_running.load(Ordering::SeqCst),
            overlay_running: self.overlay_running.load(Ordering::SeqCst),
            current_resolution,
            watcher_matched: self.watcher_matched.load(Ordering::SeqCst),
            state: RuntimeValues {
                game_on_ground: self.game_on_ground.load(Ordering::SeqCst),
                game_skill_ready: self.game_skill_ready.load(Ordering::SeqCst),
                x1_held: self.x1_held.load(Ordering::SeqCst),
                x2_held: self.x2_held.load(Ordering::SeqCst),
                skill_enabled: self.skill_enabled.load(Ordering::SeqCst),
                roblox_focused: self.roblox_focused.load(Ordering::SeqCst),
            },
            last_error: self.last_error.lock().ok().and_then(|guard| guard.clone()),
            logs: self
                .logs
                .lock()
                .map(|guard| guard.clone())
                .unwrap_or_default(),
        }
    }

    pub fn emit_status(&self, app: &AppHandle) {
        let _ = app.emit("runtime://status", self.snapshot());
    }

    pub fn push_log(&self, app: &AppHandle, message: impl Into<String>) {
        let message = message.into();
        if let Ok(mut logs) = self.logs.lock() {
            logs.insert(0, message.clone());
            logs.truncate(80);
        }
        let _ = app.emit("runtime://log", message);
        self.emit_status(app);
    }

    pub fn push_error(&self, app: &AppHandle, message: impl Into<String>) {
        let message = message.into();
        if let Ok(mut last_error) = self.last_error.lock() {
            *last_error = Some(message.clone());
        }
        if let Ok(mut logs) = self.logs.lock() {
            logs.insert(0, message.clone());
            logs.truncate(80);
        }
        let _ = app.emit("runtime://error", message);
        self.emit_status(app);
    }

    pub fn set_state(&self, key: StateKey, value: bool, app: &AppHandle) {
        let changed = match key {
            StateKey::GameOnGround => self.game_on_ground.swap(value, Ordering::SeqCst) != value,
            StateKey::GameSkillReady => {
                self.game_skill_ready.swap(value, Ordering::SeqCst) != value
            }
            StateKey::X1Held => self.x1_held.swap(value, Ordering::SeqCst) != value,
            StateKey::X2Held => self.x2_held.swap(value, Ordering::SeqCst) != value,
            StateKey::SkillEnabled => self.skill_enabled.swap(value, Ordering::SeqCst) != value,
            StateKey::RobloxFocused => self.roblox_focused.swap(value, Ordering::SeqCst) != value,
        };
        if changed {
            self.emit_status(app);
        }
    }

    pub fn state(&self, key: StateKey) -> bool {
        match key {
            StateKey::GameOnGround => self.game_on_ground.load(Ordering::SeqCst),
            StateKey::GameSkillReady => self.game_skill_ready.load(Ordering::SeqCst),
            StateKey::X1Held => self.x1_held.load(Ordering::SeqCst),
            StateKey::X2Held => self.x2_held.load(Ordering::SeqCst),
            StateKey::SkillEnabled => self.skill_enabled.load(Ordering::SeqCst),
            StateKey::RobloxFocused => self.roblox_focused.load(Ordering::SeqCst),
        }
    }

    pub fn toggle_skill_enabled(&self, app: &AppHandle) -> bool {
        let next = !self.skill_enabled.load(Ordering::SeqCst);
        self.set_state(StateKey::SkillEnabled, next, app);
        next
    }

    pub fn set_resolution(&self, width: i32, height: i32, matched: bool, app: &AppHandle) {
        let old_width = self.current_resolution_width.swap(width, Ordering::SeqCst);
        let old_height = self
            .current_resolution_height
            .swap(height, Ordering::SeqCst);
        let old_matched = self.watcher_matched.swap(matched, Ordering::SeqCst);
        if old_width != width || old_height != height || old_matched != matched {
            self.emit_status(app);
        }
    }
}

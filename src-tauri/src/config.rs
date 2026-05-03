use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SkillMode {
    Normal,
    Boomjump,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum StateKey {
    #[serde(rename = "GameOnGround")]
    GameOnGround,
    #[serde(rename = "GameSkillReady")]
    GameSkillReady,
    #[serde(rename = "X1Held")]
    X1Held,
    #[serde(rename = "X2Held")]
    X2Held,
    #[serde(rename = "skillEnabled")]
    SkillEnabled,
    #[serde(rename = "robloxFocused")]
    RobloxFocused,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrosshairConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub custom_image: Option<String>,
    #[serde(default = "default_crosshair_color")]
    pub color: String,
    #[serde(default = "default_crosshair_offset")]
    pub offset: CrosshairOffset,
    #[serde(default = "default_crosshair_scale")]
    pub scale: f64,
    #[serde(default = "default_crosshair_opacity")]
    pub opacity: f64,
}

fn default_crosshair_opacity() -> f64 {
    1.0
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CrosshairOffset {
    #[serde(default)]
    pub x: i32,
    #[serde(default = "default_crosshair_y")]
    pub y: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PixelConfig {
    pub key: StateKey,
    pub point: [i32; 2],
    pub target: [i32; 3],
    #[serde(default)]
    pub tolerance: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResolutionConfig {
    pub width: i32,
    pub height: i32,
    #[serde(default)]
    pub configs: Vec<PixelConfig>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WatcherConfig {
    #[serde(default = "default_resolutions")]
    pub resolutions: Vec<ResolutionConfig>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowConfig {
    #[serde(default)]
    pub always_on_top: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default = "default_skill")]
    pub skill: SkillMode,
    #[serde(default = "default_crosshair")]
    pub crosshair: CrosshairConfig,
    #[serde(default = "default_watcher")]
    pub watcher: WatcherConfig,
    #[serde(default)]
    pub window: WindowConfig,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfigPatch {
    pub skill: Option<SkillMode>,
    pub crosshair: Option<CrosshairConfig>,
    pub watcher: Option<WatcherConfig>,
    pub window: Option<WindowConfig>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyConfig {
    skill: Option<SkillMode>,
    crosshair: Option<CrosshairConfig>,
    window: Option<WindowConfig>,
}

pub fn load_or_migrate(app: &AppHandle) -> Result<(AppConfig, PathBuf), String> {
    let config_dir = app.path().app_config_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|err| err.to_string())?;
    let unified_path = config_dir.join("config.json");

    if unified_path.exists() {
        let bytes = fs::read(&unified_path).map_err(|err| err.to_string())?;
        let config: AppConfig = serde_json::from_slice(&bytes).map_err(|err| err.to_string())?;
        return Ok((config, unified_path));
    }

    let mut config = AppConfig::default();
    if let Some(legacy_path) = find_legacy_file("config.json") {
        if let Some(legacy) = read_json::<LegacyConfig>(&legacy_path) {
            if let Some(skill) = legacy.skill {
                config.skill = skill;
            }
            if let Some(crosshair) = legacy.crosshair {
                config.crosshair = crosshair;
            }
            if let Some(window) = legacy.window {
                config.window = window;
            }
        }
    }
    if let Some(watcher_path) = find_legacy_file("game_watcher.json") {
        if let Some(watcher) = read_json::<WatcherConfig>(&watcher_path) {
            config.watcher = watcher;
        }
    }

    save_config(&unified_path, &config)?;
    Ok((config, unified_path))
}

pub fn save_config(path: &Path, config: &AppConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let json = serde_json::to_vec_pretty(config).map_err(|err| err.to_string())?;
    fs::write(path, json).map_err(|err| err.to_string())
}

pub fn apply_patch(config: &mut AppConfig, patch: AppConfigPatch) {
    if let Some(skill) = patch.skill {
        config.skill = skill;
    }
    if let Some(crosshair) = patch.crosshair {
        config.crosshair = crosshair;
    }
    if let Some(watcher) = patch.watcher {
        config.watcher = watcher;
    }
    if let Some(window) = patch.window {
        config.window = window;
    }
}

pub fn reset_section(config: &mut AppConfig, section: &str) -> Result<(), String> {
    match section {
        "crosshair" => {
            config.crosshair = default_crosshair();
            Ok(())
        }
        "watcher" => {
            config.watcher = default_watcher();
            Ok(())
        }
        _ => Err(format!("Unknown config section: {section}")),
    }
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn find_legacy_file(name: &str) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(current) = std::env::current_dir() {
        candidates.push(current.join(name));
        if let Some(parent) = current.parent() {
            candidates.push(parent.join(name));
        }
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(name),
    );
    candidates.into_iter().find(|path| path.exists())
}

fn default_true() -> bool {
    true
}

fn default_skill() -> SkillMode {
    SkillMode::Normal
}

fn default_crosshair_color() -> String {
    "#FFFFFF".to_string()
}

fn default_crosshair_y() -> i32 {
    -200
}

fn default_crosshair_scale() -> f64 {
    1.0
}

fn default_crosshair_offset() -> CrosshairOffset {
    CrosshairOffset {
        x: 0,
        y: default_crosshair_y(),
    }
}

fn default_crosshair() -> CrosshairConfig {
    CrosshairConfig {
        enabled: true,
        custom_image: None,
        color: default_crosshair_color(),
        offset: default_crosshair_offset(),
        scale: default_crosshair_scale(),
        opacity: default_crosshair_opacity(),
    }
}

fn default_watcher() -> WatcherConfig {
    WatcherConfig {
        resolutions: default_resolutions(),
    }
}

fn default_resolutions() -> Vec<ResolutionConfig> {
    vec![
        ResolutionConfig {
            width: 1920,
            height: 1080,
            configs: vec![
                PixelConfig {
                    key: StateKey::GameOnGround,
                    point: [942, 1003],
                    target: [255, 225, 148],
                    tolerance: 0,
                },
                PixelConfig {
                    key: StateKey::GameSkillReady,
                    point: [1030, 903],
                    target: [255, 255, 255],
                    tolerance: 0,
                },
            ],
        },
        ResolutionConfig {
            width: 1600,
            height: 900,
            configs: vec![
                PixelConfig {
                    key: StateKey::GameOnGround,
                    point: [787, 835],
                    target: [255, 225, 148],
                    tolerance: 0,
                },
                PixelConfig {
                    key: StateKey::GameSkillReady,
                    point: [862, 752],
                    target: [255, 255, 255],
                    tolerance: 0,
                },
            ],
        },
    ]
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            always_on_top: false,
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            skill: default_skill(),
            crosshair: default_crosshair(),
            watcher: default_watcher(),
            window: WindowConfig::default(),
        }
    }
}

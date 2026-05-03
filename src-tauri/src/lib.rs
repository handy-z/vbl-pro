mod config;
mod focus;
mod input;
mod overlay;
mod pixel;
mod runtime;
mod state;
mod windows_util;

use config::{AppConfig, AppConfigPatch};
use state::{AppState, RuntimeStatus};
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

#[tauri::command]
fn get_runtime_status(state: tauri::State<'_, AppState>) -> RuntimeStatus {
    state.runtime().snapshot()
}

#[tauri::command]
fn set_runtime_enabled(
    enabled: bool,
    state: tauri::State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if enabled {
        runtime::start(state.inner().clone(), app);
    } else {
        runtime::stop(state.inner().clone(), app);
    }
    Ok(())
}

#[tauri::command]
fn start_runtime(state: tauri::State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    runtime::start(state.inner().clone(), app);
    Ok(())
}

#[tauri::command]
fn stop_runtime(state: tauri::State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    runtime::stop(state.inner().clone(), app);
    Ok(())
}

#[tauri::command]
fn get_config(state: tauri::State<'_, AppState>) -> Result<AppConfig, String> {
    state.config()
}

#[tauri::command]
fn update_config(
    patch: AppConfigPatch,
    state: tauri::State<'_, AppState>,
    app: AppHandle,
) -> Result<AppConfig, String> {
    let config = state.with_config(|config| {
        config::apply_patch(config, patch);
        config.clone()
    })?;
    state.bump_config_version();
    emit_config_changed(&app, &config);
    schedule_save(state.inner().clone(), app.clone());
    overlay::request_refresh();
    state.runtime().emit_status(&app);
    Ok(config)
}

#[tauri::command]
fn reset_config_section(
    section: String,
    state: tauri::State<'_, AppState>,
    app: AppHandle,
) -> Result<AppConfig, String> {
    let config = state.with_config(|config| {
        config::reset_section(config, &section)?;
        Ok::<AppConfig, String>(config.clone())
    })??;
    state.bump_config_version();
    emit_config_changed(&app, &config);
    schedule_save(state.inner().clone(), app.clone());
    overlay::request_refresh();
    state.runtime().emit_status(&app);
    Ok(config)
}

#[tauri::command]
fn set_always_on_top(
    enabled: bool,
    window: WebviewWindow,
    state: tauri::State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    window
        .set_always_on_top(enabled)
        .map_err(|err| err.to_string())?;
    let config = state.with_config(|config| {
        config.window.always_on_top = enabled;
        config.clone()
    })?;
    state.bump_config_version();
    emit_config_changed(&app, &config);
    schedule_save(state.inner().clone(), app.clone());
    state.runtime().emit_status(&app);
    Ok(())
}

#[tauri::command]
fn read_custom_image(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let (config, config_path) = config::load_or_migrate(app.handle())?;
            let always_on_top = config.window.always_on_top;
            let state = AppState::new(config, config_path);
            app.manage(state.clone());

            if let Some(window) = app.get_webview_window("main") {
                if let Err(err) = window.set_always_on_top(always_on_top) {
                    state
                        .runtime()
                        .push_error(app.handle(), format!("Failed to apply pin state: {err}"));
                }
                #[cfg(target_os = "windows")]
                if let Ok(hwnd) = window.hwnd() {
                    state
                        .runtime()
                        .app_hwnd
                        .store(hwnd.0 as isize, Ordering::SeqCst);
                }
            }

            runtime::start(state.clone(), app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_status,
            set_runtime_enabled,
            get_config,
            update_config,
            reset_config_section,
            set_always_on_top,
            start_runtime,
            stop_runtime,
            read_custom_image
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run VBL Pro");
}

fn emit_config_changed(app: &AppHandle, config: &AppConfig) {
    let _ = app.emit("config://changed", config.clone());
}

fn schedule_save(state: AppState, app: AppHandle) {
    let generation = state.next_save_generation();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(500));
        if state.save_generation() != generation {
            return;
        }

        match state.config() {
            Ok(config) => {
                if let Err(err) = config::save_config(&state.config_path(), &config) {
                    state
                        .runtime()
                        .push_error(&app, format!("Config save failed: {err}"));
                }
            }
            Err(err) => {
                state.runtime().push_error(&app, err);
            }
        }
    });
}

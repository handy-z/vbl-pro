use crate::state::AppState;
use crate::{focus, input, overlay, pixel};
use std::sync::atomic::Ordering;
use tauri::AppHandle;

pub fn start(state: AppState, app: AppHandle) {
    if state.runtime().runtime_enabled.swap(true, Ordering::SeqCst) {
        state.runtime().emit_status(&app);
        return;
    }

    state.runtime().push_log(&app, "Runtime started");
    focus::start(state.clone(), app.clone());
    pixel::start(state.clone(), app.clone());
    input::start_hook(state.clone(), app.clone());
    input::start_x2_loop(state.clone(), app.clone());
    overlay::start(state.clone(), app.clone());
    state.runtime().emit_status(&app);
}

pub fn stop(state: AppState, app: AppHandle) {
    if !state
        .runtime()
        .runtime_enabled
        .swap(false, Ordering::SeqCst)
    {
        state.runtime().emit_status(&app);
        return;
    }

    focus::stop(&state);
    pixel::stop(&state);
    input::stop_hook(&state);
    input::stop_x2_loop();
    overlay::stop(&state);
    state.runtime().push_log(&app, "Runtime stopped");
    state.runtime().emit_status(&app);
}

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppConfig, RuntimeStatus } from "./types";

export function getRuntimeStatus() {
  return invoke<RuntimeStatus>("get_runtime_status");
}

export function setRuntimeEnabled(enabled: boolean) {
  return invoke<void>("set_runtime_enabled", { enabled });
}

export function getConfig() {
  return invoke<AppConfig>("get_config");
}

export function updateConfig(patch: Partial<AppConfig>) {
  return invoke<AppConfig>("update_config", { patch });
}

export function resetConfigSection(section: "crosshair" | "watcher") {
  return invoke<AppConfig>("reset_config_section", { section });
}

export function setAlwaysOnTop(enabled: boolean) {
  return invoke<void>("set_always_on_top", { enabled });
}

export function onRuntimeStatus(callback: (status: RuntimeStatus) => void) {
  return listen<RuntimeStatus>("runtime://status", (event) => callback(event.payload));
}

export function onRuntimeLog(callback: (message: string) => void) {
  return listen<string>("runtime://log", (event) => callback(event.payload));
}

export function onRuntimeError(callback: (message: string) => void) {
  return listen<string>("runtime://error", (event) => callback(event.payload));
}

export function onConfigChanged(callback: (config: AppConfig) => void) {
  return listen<AppConfig>("config://changed", (event) => callback(event.payload));
}

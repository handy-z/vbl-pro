import { MonitorIcon, MoonIcon, PinIcon, SunIcon } from "./icons";
import type { ThemeMode } from "../hooks/useTheme";
import type { AppConfig, RuntimeStatus } from "../types";

type TopBarProps = {
  config: AppConfig;
  status: RuntimeStatus;
  theme: ThemeMode;
  onCycleTheme: () => void;
  onToggleRuntime: () => void;
  onSetAlwaysOnTop: (enabled: boolean) => Promise<void>;
};

export function TopBar({
  config,
  status,
  theme,
  onCycleTheme,
  onToggleRuntime,
  onSetAlwaysOnTop,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div>
        <h1>VBL Pro</h1>
        <p>{status.robloxFocused ? "Roblox focused" : "Waiting for Roblox"}</p>
      </div>
      <div className="top-actions">
        <button onClick={onCycleTheme} title="Cycle Theme">
          {theme === "system" ? <MonitorIcon /> : theme === "light" ? <SunIcon /> : <MoonIcon />}
          {theme === "system" ? "System" : theme === "light" ? "Light" : "Dark"}
        </button>
        <button
          className={config.window.alwaysOnTop ? "primary" : ""}
          onClick={() => onSetAlwaysOnTop(!config.window.alwaysOnTop)}
        >
          <PinIcon filled={config.window.alwaysOnTop} />
          {config.window.alwaysOnTop ? "Pinned" : "Pin"}
        </button>
        <button
          className={status.runtimeEnabled ? "danger" : "primary"}
          onClick={onToggleRuntime}
        >
          {status.runtimeEnabled ? "Stop" : "Start"}
        </button>
      </div>
    </header>
  );
}

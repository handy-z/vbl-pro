import { useState } from "react";
import { CrosshairConfigPanel } from "./components/CrosshairConfigPanel";
import { MacroConfig } from "./components/MacroConfig";
import { RuntimeDashboard } from "./components/RuntimeDashboard";
import { TopBar } from "./components/TopBar";
import { WatcherEditor } from "./components/WatcherEditor";
import { useAppConfig } from "./hooks/useAppConfig";
import { useRuntime } from "./hooks/useRuntime";
import { useTheme } from "./hooks/useTheme";

export function App() {
  const [tab, setTab] = useState<"runtime" | "config">("runtime");
  const {
    config,
    configLoading,
    patchConfig,
    resetSection,
    setWindowAlwaysOnTop,
  } = useAppConfig();
  const {
    status,
    logs,
    runtimeLoading,
    clearLogs,
    toggleRuntime,
  } = useRuntime();
  const { theme, cycleTheme } = useTheme();

  if (configLoading || runtimeLoading || !config) {
    return <main className="app loading">Loading VBL Pro...</main>;
  }

  return (
    <main className="app">
      <TopBar
        config={config}
        status={status}
        theme={theme}
        onCycleTheme={cycleTheme}
        onToggleRuntime={toggleRuntime}
        onSetAlwaysOnTop={setWindowAlwaysOnTop}
      />

      <nav className="tabs">
        <button className={tab === "runtime" ? "active" : ""} onClick={() => setTab("runtime")}>Runtime</button>
        <button className={tab === "config" ? "active" : ""} onClick={() => setTab("config")}>Config</button>
      </nav>

      {tab === "runtime" ? (
        <RuntimeDashboard status={status} logs={logs} onClearLogs={clearLogs} />
      ) : (
        <section className="config-grid">
          <MacroConfig
            skill={config.skill}
            onChange={(skill) => patchConfig((draft) => { draft.skill = skill; })}
          />
          <CrosshairConfigPanel
            config={config}
            patchConfig={patchConfig}
            onReset={() => resetSection("crosshair")}
          />
          <WatcherEditor
            config={config}
            patchConfig={patchConfig}
            onReset={() => resetSection("watcher")}
          />
        </section>
      )}
    </main>
  );
}

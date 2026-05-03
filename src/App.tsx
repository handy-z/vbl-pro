import { useEffect, useMemo, useRef, useState } from "react";
import {
  getConfig,
  getRuntimeStatus,
  onConfigChanged,
  onRuntimeError,
  onRuntimeLog,
  onRuntimeStatus,
  resetConfigSection,
  setAlwaysOnTop,
  setRuntimeEnabled,
  updateConfig,
} from "./api";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { HexColorPicker } from "react-colorful";
import defaultCrosshair from "../assets/crosshair.png";
import type { AppConfig, PixelConfig, RuntimeStatus, StateKey } from "./types";

const PinIcon = ({ filled }: { filled: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="17" x2="12" y2="22"></line>
    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 11.2V6a3 3 0 0 0-6 0v5.2a2 2 0 0 1-1.11 1.35l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
  </svg>
);

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4"></circle>
    <path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
  </svg>
);

const MonitorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="14" x="2" y="3" rx="2"></rect><line x1="8" x2="16" y1="21" y2="21"></line><line x1="12" x2="12" y1="17" y2="21"></line>
  </svg>
);

type LogEntry = { id: number; kind: "log" | "error"; ts: string; message: string };

const stateKeys: StateKey[] = [
  "GameOnGround",
  "GameSkillReady",
  "X1Held",
  "X2Held",
  "skillEnabled",
  "robloxFocused",
];

const defaultStatus: RuntimeStatus = {
  runtimeEnabled: false,
  robloxFocused: false,
  focusMonitorRunning: false,
  pixelScannerRunning: false,
  inputHookRunning: false,
  overlayRunning: false,
  currentResolution: null,
  watcherMatched: false,
  state: {
    GameOnGround: false,
    GameSkillReady: false,
    X1Held: false,
    X2Held: false,
    skillEnabled: true,
    robloxFocused: false,
  },
  lastError: null,
  logs: [],
};

function cloneConfig(config: AppConfig): AppConfig {
  return structuredClone(config);
}

export function App() {
  const [tab, setTab] = useState<"runtime" | "config">("runtime");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState<RuntimeStatus>(defaultStatus);
  const [busy, setBusy] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logCounterRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [theme, setTheme] = useState<"system" | "light" | "dark">(
    () => (localStorage.getItem("theme") as "system" | "light" | "dark" | null) ?? "system"
  );

  useEffect(() => {
    localStorage.setItem("theme", theme);
    if (theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  function cycleTheme() {
    setTheme((t) => t === "system" ? "light" : t === "light" ? "dark" : "system");
  }

  useEffect(() => {
    if (logEndRef.current && isAtBottom) {
      logEndRef.current.scrollTop = logEndRef.current.scrollHeight;
    }
  }, [logs]);

  function handleLogScroll() {
    if (!logEndRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logEndRef.current;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 20);
  }

  useEffect(() => {
    let mounted = true;
    Promise.all([getConfig(), getRuntimeStatus()]).then(([cfg, runtime]) => {
      if (!mounted) return;
      setConfig(cfg);
      setStatus(runtime);
      setBusy(false);
    });

    const unsubs = Promise.all([
      onRuntimeStatus(setStatus),
      onRuntimeLog((message) => {
        const id = ++logCounterRef.current;
        const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setLogs((prev) => [...prev, { id, kind: "log" as const, ts, message }].slice(-200));
      }),
      onRuntimeError((message) => {
        const id = ++logCounterRef.current;
        const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setStatus((prev) => ({ ...prev, lastError: message }));
        setLogs((prev) => [...prev, { id, kind: "error" as const, ts, message }].slice(-200));
      }),
      onConfigChanged(setConfig),
    ]);

    return () => {
      mounted = false;
      unsubs.then((items) => items.forEach((unsub) => unsub()));
    };
  }, []);

  async function applyConfig(next: AppConfig) {
    setConfig(next);
    const saved = await updateConfig(next);
    setConfig(saved);
  }

  async function patchConfig(mutator: (draft: AppConfig) => void) {
    if (!config) return;
    const next = cloneConfig(config);
    mutator(next);
    await applyConfig(next);
  }

  const resolutionLabel = useMemo(() => {
    if (!status.currentResolution) return "Unknown";
    return `${status.currentResolution.width}x${status.currentResolution.height}`;
  }, [status.currentResolution]);

  const [previewImageSrc, setPreviewImageSrc] = useState<string>(defaultCrosshair);

  useEffect(() => {
    if (!config?.crosshair.customImage) {
      setPreviewImageSrc(defaultCrosshair);
      return;
    }
    
    let active = true;
    invoke<number[]>("read_custom_image", { path: config.crosshair.customImage })
      .then(bytes => {
        if (!active) return;
        
        const ext = config.crosshair.customImage!.split('.').pop()?.toLowerCase();
        let mime = "image/png";
        if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";
        else if (ext === "webp") mime = "image/webp";
        else if (ext === "gif") mime = "image/gif";
        else if (ext === "ico") mime = "image/x-icon";
        else if (ext === "bmp") mime = "image/bmp";

        const blob = new Blob([new Uint8Array(bytes)], { type: mime });
        setPreviewImageSrc(URL.createObjectURL(blob));
      })
      .catch(err => {
        console.error("Failed to load custom crosshair:", err);
        if (active) setPreviewImageSrc(defaultCrosshair);
      });

    return () => { active = false; };
  }, [config?.crosshair.customImage]);

  if (busy || !config) {
    return <main className="app loading">Loading VBL Pro...</main>;
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>VBL Pro</h1>
          <p>{status.robloxFocused ? "Roblox focused" : "Waiting for Roblox"}</p>
        </div>
        <div className="top-actions">
          <button onClick={cycleTheme} title="Cycle Theme">
            {theme === "system" ? <MonitorIcon /> : theme === "light" ? <SunIcon /> : <MoonIcon />}
            {theme === "system" ? "System" : theme === "light" ? "Light" : "Dark"}
          </button>
          <button
            className={config.window.alwaysOnTop ? "primary" : ""}
            onClick={async () => {
              const enabled = !config.window.alwaysOnTop;
              setConfig({ ...config, window: { alwaysOnTop: enabled } });
              await setAlwaysOnTop(enabled);
            }}
          >
            <PinIcon filled={config.window.alwaysOnTop} />
            {config.window.alwaysOnTop ? "Pinned" : "Pin"}
          </button>
          <button
            className={status.runtimeEnabled ? "danger" : "primary"}
            onClick={() => setRuntimeEnabled(!status.runtimeEnabled)}
          >
            {status.runtimeEnabled ? "Stop" : "Start"}
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === "runtime" ? "active" : ""} onClick={() => setTab("runtime")}>Runtime</button>
        <button className={tab === "config" ? "active" : ""} onClick={() => setTab("config")}>Config</button>
      </nav>

      {tab === "runtime" ? (
        <section className="runtime-grid">
          <StatusCard label="Runtime" value={status.runtimeEnabled ? "Enabled" : "Disabled"} tone={status.runtimeEnabled ? "good" : "muted"} />
          <StatusCard label="Roblox" value={status.robloxFocused ? "Focused" : "Not focused"} tone={status.robloxFocused ? "good" : "warn"} />
          <StatusCard label="Resolution" value={resolutionLabel} tone={status.watcherMatched ? "good" : "warn"} />
          <StatusCard label="Overlay" value={status.overlayRunning ? "Running" : "Stopped"} tone={status.overlayRunning ? "good" : "muted"} />
          <StatusCard label="Pixel scanner" value={status.pixelScannerRunning ? "Running" : "Stopped"} tone={status.pixelScannerRunning ? "good" : "muted"} />
          <StatusCard label="Input hook" value={status.inputHookRunning ? "Running" : "Stopped"} tone={status.inputHookRunning ? "good" : "muted"} />

          <section className="panel state-panel">
            <h2>State</h2>
            <div className="state-grid">
              {stateKeys.map((key) => (
                <div key={key} className={`state-pill ${status.state[key] ? "on" : ""}`}>
                  <span>{key}</span>
                  <strong>{status.state[key] ? "On" : "Off"}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="panel log-panel">
            <div className="log-panel-header">
              <h2>Runtime Log {logs.length > 0 && <span className="log-count">({logs.length})</span>}</h2>
              <div className="log-panel-actions">
                {!isAtBottom && (
                  <button onClick={() => {
                    if (logEndRef.current) logEndRef.current.scrollTop = logEndRef.current.scrollHeight;
                  }}>
                    ↓ Bottom
                  </button>
                )}
                {status.lastError && <span className="log-last-error">{status.lastError}</span>}
                <button onClick={() => setLogs([])} disabled={logs.length === 0}>Clear</button>
              </div>
            </div>
            <div className="log-list" ref={logEndRef as React.RefObject<HTMLDivElement>} onScroll={handleLogScroll}>
              {logs.length === 0
                ? <p className="empty">No logs yet.</p>
                : logs.map((entry) => (
                  <div key={entry.id} className={`log-entry ${entry.kind}`}>
                    <span className="log-ts">{entry.ts}</span>
                    <span className="log-msg">{entry.message}</span>
                  </div>
                ))}
            </div>
          </section>
        </section>
      ) : (
        <section className="config-grid">
          <section className="panel">
            <h2>Macro</h2>
            <div className="config-group">
              <label>
                Skill
                <select value={config.skill} onChange={(event) => patchConfig((draft) => { draft.skill = event.target.value as AppConfig["skill"]; })}>
                  <option value="normal">Normal</option>
                  <option value="boomjump">Boomjump</option>
                </select>
              </label>
            </div>
          </section>

          <section className="panel crosshair-panel">
            <div className="panel-title-row">
              <h2>Crosshair</h2>
              <button className="small-btn" onClick={async () => setConfig(await resetConfigSection("crosshair"))}>Reset</button>
            </div>
            <div className="crosshair-config-layout">
              <div className="config-group">
                <div className="crosshair-top-row">
                  <label className="check-row">
                    <input type="checkbox" checked={config.crosshair.enabled} onChange={(event) => patchConfig((draft) => { draft.crosshair.enabled = event.target.checked; })} />
                    Enabled
                  </label>
                </div>
                
                <div className="custom-image-row">
                  <span className="label-text">Image</span>
                  <div className="image-picker">
                    <button className="small-btn" onClick={async () => {
                      try {
                        const file = await open({
                          multiple: false,
                          filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "ico", "bmp"] }],
                        });
                        if (typeof file === "string") {
                          patchConfig(draft => { draft.crosshair.customImage = file; });
                        }
                      } catch (e) {
                        console.error("Failed to open dialog", e);
                      }
                    }}>Browse...</button>
                    {config.crosshair.customImage ? (
                      <>
                        <span className="file-name" title={config.crosshair.customImage}>
                          {config.crosshair.customImage.split(/[\\/]/).pop()}
                        </span>
                        <button className="small-btn danger" onClick={() => patchConfig(draft => { draft.crosshair.customImage = null; })}>Clear</button>
                      </>
                    ) : (
                      <span className="file-name text-muted">Default</span>
                    )}
                  </div>
                </div>

                <div className="crosshair-sliders">
                  <SliderField label="Offset X" value={config.crosshair.offset.x} min={-500} max={500} onChange={(value) => patchConfig((draft) => { draft.crosshair.offset.x = value; })} />
                  <SliderField label="Offset Y" value={config.crosshair.offset.y} min={-500} max={500} onChange={(value) => patchConfig((draft) => { draft.crosshair.offset.y = value; })} />
                  <SliderField label="Scale" value={config.crosshair.scale} step={0.1} min={0.1} max={10.0} onChange={(value) => patchConfig((draft) => { draft.crosshair.scale = value; })} />
                  <SliderField label="Opacity" value={config.crosshair.opacity ?? 1.0} step={0.05} min={0.1} max={1.0} onChange={(value) => patchConfig((draft) => { draft.crosshair.opacity = value; })} />
                </div>
              </div>
              <div className="crosshair-visuals">
                <div className="preview-checkerboard">
                  <div className="preview-scaler" style={{
                    transform: `scale(${config.crosshair.scale})`,
                    opacity: config.crosshair.opacity ?? 1.0,
                  }}>
                    <img src={previewImageSrc} className="preview-base-img" alt="" />
                    <div className="preview-multiply-tint" style={{
                      backgroundColor: config.crosshair.color,
                      maskImage: `url("${previewImageSrc}")`,
                      WebkitMaskImage: `url("${previewImageSrc}")`,
                    }} />
                  </div>
                </div>
                <HexColorPicker color={config.crosshair.color} onChange={(val) => patchConfig((draft) => { draft.crosshair.color = val; })} />
              </div>
            </div>
          </section>

          <section className="panel watcher-panel">
            <div className="panel-title-row">
              <h2>Pixel Watcher</h2>
              <button className="small-btn" onClick={async () => setConfig(await resetConfigSection("watcher"))}>Reset</button>
            </div>
            {config.watcher.resolutions.map((resolution, resolutionIndex) => (
              <div className="resolution-editor" key={`${resolution.width}-${resolution.height}-${resolutionIndex}`}>
                <div className="resolution-title">
                  <h3>{resolution.width} x {resolution.height}</h3>
                  <div className="resolution-inputs">
                    <NumberField label="Width" value={resolution.width} onChange={(value) => patchConfig((draft) => {
                      const target = draft.watcher.resolutions[resolutionIndex];
                      if (target) target.width = value;
                    })} />
                    <NumberField label="Height" value={resolution.height} onChange={(value) => patchConfig((draft) => {
                      const target = draft.watcher.resolutions[resolutionIndex];
                      if (target) target.height = value;
                    })} />
                  </div>
                </div>
                {resolution.configs.map((pixel, pixelIndex) => (
                  <PixelEditor
                    key={`${pixel.key}-${pixelIndex}`}
                    pixel={pixel}
                    onChange={(next) => patchConfig((draft) => {
                      const target = draft.watcher.resolutions[resolutionIndex]?.configs;
                      if (target) target[pixelIndex] = next;
                    })}
                  />
                ))}
              </div>
            ))}
          </section>
        </section>
      )}
    </main>
  );
}

function StatusCard({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "muted" }) {
  return (
    <section className={`status-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function NumberField({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (value: number) => void }) {
  return (
    <label>
      {label}
      <input type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function SliderField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return (
    <label className="slider-field">
      <div className="slider-header">
        <span>{label}</span>
        <input type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function PixelEditor({ pixel, onChange }: { pixel: PixelConfig; onChange: (pixel: PixelConfig) => void }) {
  function update(mutator: (draft: PixelConfig) => void) {
    const next = structuredClone(pixel);
    mutator(next);
    onChange(next);
  }

  const hexColor = "#" + pixel.target.map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');

  return (
    <div className="pixel-editor">
      <div className="state-label-container">
        <span className="label-text">State</span>
        <div className="state-badge">{pixel.key}</div>
      </div>
      <NumberField label="X" value={pixel.point[0]} onChange={(value) => update((draft) => { draft.point[0] = value; })} />
      <NumberField label="Y" value={pixel.point[1]} onChange={(value) => update((draft) => { draft.point[1] = value; })} />
      <label className="pixel-color-label">
        Color
        <input 
          type="color" 
          value={hexColor} 
          onChange={(e) => {
            const hex = e.target.value;
            const val = parseInt(hex.slice(1), 16);
            update(draft => { draft.target = [(val >> 16) & 255, (val >> 8) & 255, val & 255]; });
          }} 
        />
      </label>
      <NumberField label="Tolerance" value={pixel.tolerance} onChange={(value) => update((draft) => { draft.tolerance = value; })} />
    </div>
  );
}

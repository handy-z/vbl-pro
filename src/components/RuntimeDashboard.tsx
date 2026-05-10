import { RuntimeLogs } from "./RuntimeLogs";
import type { LogEntry } from "../hooks/useRuntime";
import type { RuntimeStatus, StateKey } from "../types";

const stateKeys: StateKey[] = [
  "GameOnGround",
  "GameSkillReady",
  "X1Held",
  "X2Held",
  "skillEnabled",
  "robloxFocused",
];

type RuntimeDashboardProps = {
  status: RuntimeStatus;
  logs: LogEntry[];
  onClearLogs: () => void;
};

export function RuntimeDashboard({ status, logs, onClearLogs }: RuntimeDashboardProps) {
  const resolutionLabel = status.currentResolution
    ? `${status.currentResolution.width}x${status.currentResolution.height}`
    : "Unknown";

  return (
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

      <RuntimeLogs logs={logs} lastError={status.lastError} onClear={onClearLogs} />
    </section>
  );
}

function StatusCard({ label, value, tone }: {
  label: string;
  value: string;
  tone: "good" | "warn" | "muted";
}) {
  return (
    <section className={`status-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

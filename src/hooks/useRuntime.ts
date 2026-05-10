import { useEffect, useRef, useState } from "react";
import {
  getRuntimeStatus,
  onRuntimeError,
  onRuntimeLog,
  onRuntimeStatus,
  setRuntimeEnabled,
} from "../api";
import type { RuntimeStatus } from "../types";

export type LogEntry = { id: number; kind: "log" | "error"; ts: string; message: string };

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

function timestamp() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function useRuntime() {
  const [status, setStatus] = useState<RuntimeStatus>(defaultStatus);
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logCounterRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    getRuntimeStatus().then((runtime) => {
      if (!mounted) return;
      setStatus(runtime);
      setRuntimeLoading(false);
    });

    const unsubs = Promise.all([
      onRuntimeStatus((runtime) => {
        setStatus(runtime);
        setRuntimeLoading(false);
      }),
      onRuntimeLog((message) => {
        const id = ++logCounterRef.current;
        setLogs((prev) => [...prev, { id, kind: "log" as const, ts: timestamp(), message }].slice(-200));
      }),
      onRuntimeError((message) => {
        const id = ++logCounterRef.current;
        setStatus((prev) => ({ ...prev, lastError: message }));
        setLogs((prev) => [...prev, { id, kind: "error" as const, ts: timestamp(), message }].slice(-200));
      }),
    ]);

    return () => {
      mounted = false;
      unsubs.then((items) => items.forEach((unsub) => unsub()));
    };
  }, []);

  async function toggleRuntime() {
    await setRuntimeEnabled(!status.runtimeEnabled);
  }

  function clearLogs() {
    setLogs([]);
  }

  return {
    status,
    logs,
    runtimeLoading,
    clearLogs,
    toggleRuntime,
  };
}

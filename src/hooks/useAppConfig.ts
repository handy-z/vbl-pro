import { useEffect, useState } from "react";
import {
  getConfig,
  onConfigChanged,
  resetConfigSection,
  setAlwaysOnTop,
  updateConfig,
} from "../api";
import type { AppConfig } from "../types";

function cloneConfig(config: AppConfig): AppConfig {
  return structuredClone(config);
}

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    getConfig().then((loaded) => {
      if (!mounted) return;
      setConfig(loaded);
      setConfigLoading(false);
    });

    const unsubscribe = onConfigChanged((next) => {
      setConfig(next);
      setConfigLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe.then((stop) => stop());
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

  async function resetSection(section: "crosshair" | "watcher") {
    const next = await resetConfigSection(section);
    setConfig(next);
  }

  async function setWindowAlwaysOnTop(enabled: boolean) {
    if (!config) return;
    setConfig({ ...config, window: { alwaysOnTop: enabled } });
    await setAlwaysOnTop(enabled);
  }

  return {
    config,
    configLoading,
    patchConfig,
    resetSection,
    setWindowAlwaysOnTop,
  };
}

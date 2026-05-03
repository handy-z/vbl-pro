export type StateKey =
  | "GameOnGround"
  | "GameSkillReady"
  | "X1Held"
  | "X2Held"
  | "skillEnabled"
  | "robloxFocused";

export type CrosshairConfig = {
  enabled: boolean;
  customImage: string | null;
  color: string;
  offset: { x: number; y: number };
  scale: number;
  opacity: number;
};

export type PixelConfig = {
  key: StateKey;
  point: [number, number];
  target: [number, number, number];
  tolerance: number;
};

export type ResolutionConfig = {
  width: number;
  height: number;
  configs: PixelConfig[];
};

export type WatcherConfig = {
  resolutions: ResolutionConfig[];
};

export type WindowConfig = {
  alwaysOnTop: boolean;
};

export type AppConfig = {
  skill: "normal" | "boomjump";
  crosshair: CrosshairConfig;
  watcher: WatcherConfig;
  window: WindowConfig;
};


export type RuntimeStatus = {
  runtimeEnabled: boolean;
  robloxFocused: boolean;
  focusMonitorRunning: boolean;
  pixelScannerRunning: boolean;
  inputHookRunning: boolean;
  overlayRunning: boolean;
  currentResolution: { width: number; height: number } | null;
  watcherMatched: boolean;
  state: Record<StateKey, boolean>;
  lastError: string | null;
  logs: string[];
};

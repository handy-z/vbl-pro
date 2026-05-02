declare var self: Worker;

import { dlopen, FFIType } from "bun:ffi";
import { GameState, type StateKey } from "state";

const user32 = dlopen("user32.dll", {
  GetDC: { args: [FFIType.ptr], returns: FFIType.ptr },
  ReleaseDC: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  GetSystemMetrics: { args: [FFIType.i32], returns: FFIType.i32 },
});

const gdi32 = dlopen("gdi32.dll", {
  GetPixel: { args: [FFIType.ptr, FFIType.i32, FFIType.i32], returns: FFIType.u32 },
});

type PixelConfig = {
  key: StateKey;
  point: [number, number];
  target: [number, number, number];
  tolerance: number;
};

type ResolutionEntry = {
  width: number;
  height: number;
  configs: PixelConfig[];
};

type PreparedPixelConfig = {
  key: StateKey;
  x: number;
  y: number;
  minR: number;
  maxR: number;
  minG: number;
  maxG: number;
  minB: number;
  maxB: number;
};

type PreparedResolutionMap = Map<string, PreparedPixelConfig[]>;

self.onmessage = (e: MessageEvent) => {
  const { sab, slots, resolutions } = e.data as {
    sab: SharedArrayBuffer;
    slots: Record<StateKey, number>;
    resolutions: ResolutionEntry[];
  };
  const state = GameState.from({ sab, slots });
  loop(state, prepareResolutions(resolutions));
};

function getScreenSize(): [number, number] {
  return [
    user32.symbols.GetSystemMetrics(0),
    user32.symbols.GetSystemMetrics(1),
  ];
}

function resolutionKey(width: number, height: number): string {
  return `${width}x${height}`;
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function prepareConfig(config: PixelConfig): PreparedPixelConfig {
  const [x, y] = config.point;
  const [r, g, b] = config.target;
  const tolerance = config.tolerance;
  return {
    key: config.key,
    x,
    y,
    minR: clampColor(r - tolerance),
    maxR: clampColor(r + tolerance),
    minG: clampColor(g - tolerance),
    maxG: clampColor(g + tolerance),
    minB: clampColor(b - tolerance),
    maxB: clampColor(b + tolerance),
  };
}

function prepareResolutions(resolutions: ResolutionEntry[]): PreparedResolutionMap {
  return new Map(
    resolutions.map((entry) => [
      resolutionKey(entry.width, entry.height),
      entry.configs.map(prepareConfig),
    ]),
  );
}

function findConfigs(resolutions: PreparedResolutionMap, width: number, height: number): PreparedPixelConfig[] | null {
  return resolutions.get(resolutionKey(width, height)) ?? null;
}

function matchesConfig(colorref: number, config: PreparedPixelConfig): number {
  const r = colorref & 0xff;
  const g = (colorref >>> 8) & 0xff;
  const b = (colorref >>> 16) & 0xff;
  return r >= config.minR
    && r <= config.maxR
    && g >= config.minG
    && g <= config.maxG
    && b >= config.minB
    && b <= config.maxB
    ? 1
    : 0;
}

const RESOLUTION_CHECK_INTERVAL = 100;

async function loop(state: GameState, resolutions: PreparedResolutionMap) {
  let [curW, curH] = getScreenSize();
  let configs = findConfigs(resolutions, curW, curH);
  let ticksSinceCheck = 0;

  if (configs) {
    self.postMessage({ type: "resolution", width: curW, height: curH });
  } else {
    self.postMessage({ type: "resolution_missing", width: curW, height: curH });
    state.reset();
  }

  while (true) {
    ticksSinceCheck++;

    if (ticksSinceCheck >= RESOLUTION_CHECK_INTERVAL) {
      ticksSinceCheck = 0;
      const [newW, newH] = getScreenSize();
      if (newW !== curW || newH !== curH) {
        curW = newW;
        curH = newH;
        configs = findConfigs(resolutions, curW, curH);

        if (configs) {
          self.postMessage({ type: "resolution", width: curW, height: curH });
        } else {
          self.postMessage({ type: "resolution_missing", width: curW, height: curH });
          state.reset();
        }
      }
    }

    if (configs) {
      const hdc = user32.symbols.GetDC(null);
      if (hdc) {
        for (const cfg of configs) {
          state.set(cfg.key, matchesConfig(gdi32.symbols.GetPixel(hdc, cfg.x, cfg.y), cfg));
        }
        user32.symbols.ReleaseDC(null, hdc);
      }
    }

    await Bun.sleep(16);
  }
}

import { gameState, watcherConfig } from "./state";
import config from "../config.json";

const { startScanner, stopScanner } = require("../native/pixel/pixel.node");
const { startFocusMonitor: startNativeFocus, stopFocusMonitor: stopNativeFocus } = require("../native/focus/focus.node");
const { startX2Loop, stopX2Loop } = require("../native/input/input.node");

export function startPixelScanner() {
  const mappedResolutions = watcherConfig.resolutions.map((res) => ({
    width: res.width,
    height: res.height,
    configs: res.configs.map((cfg) => ({
      slot: gameState.slots[cfg.key as keyof typeof gameState.slots],
      point: cfg.point,
      target: cfg.target,
      tolerance: cfg.tolerance,
    })),
  }));

  startScanner(
    gameState.view,
    JSON.stringify(mappedResolutions),
    (err: any, jsonStr: string) => {
      if (err) {
        console.error("Pixel scanner error", err);
        return;
      }
      try {
        const e = JSON.parse(jsonStr);
        if (e.type === "resolution") {
          console.log(`Resolution: ${e.width}x${e.height}`);
        } else if (e.type === "resolution_missing") {
          console.warn(`No config for resolution ${e.width}x${e.height}`);
        }
      } catch (parseErr) {
        console.error("Failed to parse pixel scanner event", parseErr);
      }
    }
  );
}

export function stopPixelScanner() {
  stopScanner();
}

export function startLoopx2() {
  startX2Loop(
    gameState.view,
    gameState.slots.X2Held,
    gameState.slots.GameOnGround,
    gameState.slots.skillEnabled,
    gameState.slots.GameSkillReady,
    config.skill === "boomjump",
  );
}

export function stopLoopx2() {
  stopX2Loop();
}

export function startFocusMonitor(onFocusChange: (active: boolean) => void) {
  startNativeFocus(
    gameState.view,
    gameState.slots.robloxFocused,
    "RobloxPlayerBeta.exe",
    (err: any, active: boolean) => {
      if (err) {
        console.error("Focus monitor error", err);
        return;
      }
      onFocusChange(active);
    }
  );
}

export function stopFocusMonitor() {
  stopNativeFocus();
}

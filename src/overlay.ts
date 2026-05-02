import crosshairPath from "../assets/crosshair.png" with { type: "file" };
import config from "../config.json";

type OverlayNative = {
  startOverlay(image: Uint8Array, cfg: typeof config.crosshair, targetProcessName?: string): void;
  stopOverlay(): void;
  isOverlayRunning(): boolean;
};

const native = require("../native/overlay/overlay.node") as OverlayNative;
const targetProcessName = "RobloxPlayerBeta.exe";

export async function startCrosshairOverlay() {
  if (!config.crosshair.enabled) {
    return;
  }
  const image = new Uint8Array(await Bun.file(crosshairPath).arrayBuffer());
  native.startOverlay(image, config.crosshair, targetProcessName);
}

export function stopCrosshairOverlay() {
  native.stopOverlay();
}

export function isCrosshairOverlayRunning() {
  return native.isOverlayRunning();
}

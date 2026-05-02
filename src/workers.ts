import { gameState, watcherConfig } from "./state";
import { keyboard } from "../winput";
import config from "../config.json";

function createWorker(name: string) {
  return import.meta.url.endsWith(".js")
    ? new Worker(new URL(`./workers/${name}.js`, import.meta.url))
    : import.meta.url.endsWith(".ts")
      ? new Worker(new URL(`./workers/${name}.ts`, import.meta.url))
      : new Worker(`./workers/${name}.ts`);
}

function bindWorkerErrors(worker: Worker, name: string) {
  worker.onerror = (event) => {
    console.error(`${name} worker error`, event.message);
  };
  worker.onmessageerror = () => {
    console.error(`${name} worker message error`);
  };
}

export function initPixelWorker() {
  const pixelWorker = createWorker("pixel");
  bindWorkerErrors(pixelWorker, "pixel");
  pixelWorker.postMessage({
    ...gameState.transferable(),
    resolutions: watcherConfig.resolutions.map((res) => ({
      width: res.width,
      height: res.height,
      configs: res.configs.map((cfg) => ({
        key: cfg.key,
        point: cfg.point,
        target: cfg.target,
        tolerance: cfg.tolerance,
      })),
    })),
  });

  pixelWorker.onmessage = (e: MessageEvent) => {
    if (e.data.type === "resolution") {
      console.log(`Resolution: ${e.data.width}x${e.data.height}`);
    } else if (e.data.type === "resolution_missing") {
      console.warn(`No config for resolution ${e.data.width}x${e.data.height}`);
    }
  };

  return pixelWorker;
}

export function initLoopx2Worker() {
  const loopx2Worker = createWorker("x2");
  bindWorkerErrors(loopx2Worker, "x2");
  loopx2Worker.postMessage({
    type: "init",
    ...gameState.transferable(),
  });

  loopx2Worker.onmessage = async (e: MessageEvent) => {
    if (e.data.action === "combo") {
      if (gameState.is("skillEnabled") && gameState.is("GameSkillReady") && config.skill === "boomjump") {
        await keyboard.tap("shift").tap("ctrl").wait(25).tap("shift");
      } else {
        await keyboard.tap("shift").tap("space").tap("shift");
      }
      loopx2Worker.postMessage({ type: "done" });
    }
  };

  return loopx2Worker;
}

export function initFocusWorker() {
  const focusWorker = createWorker("focus");
  bindWorkerErrors(focusWorker, "focus");
  focusWorker.postMessage({
    type: "init",
    ...gameState.transferable(),
  });
  return focusWorker;
}

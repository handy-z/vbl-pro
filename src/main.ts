import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { startPixelScanner, stopPixelScanner, startLoopx2, stopLoopx2, startFocusMonitor } from "./workers";
import { startCrosshairOverlay, stopCrosshairOverlay } from "./overlay";
import { bindMouseEvents } from "./input";
import { join } from "node:path";
import winput from "../winput";

const lockPath = join(Bun.env.TEMP ?? Bun.env.TMP ?? ".", "vbl-pro.lock");

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockPid() {
  try {
    return Number(readFileSync(lockPath, "utf8").trim());
  } catch {
    return NaN;
  }
}

function removeLock() {
  try {
    unlinkSync(lockPath);
  } catch {}
}

function releaseLock() {
  if (readLockPid() === process.pid) {
    removeLock();
  }
}

function stopOverlay() {
  try {
    stopCrosshairOverlay();
  } catch (error) {
    console.error("Overlay stop failed", error);
  }
}

function cleanup() {
  stopOverlay();
  releaseLock();
}

function acquireLock() {
  while (true) {
    try {
      const fd = openSync(lockPath, "wx");
      try {
        writeFileSync(fd, String(process.pid));
      } finally {
        closeSync(fd);
      }
      process.on("exit", cleanup);
      process.on("SIGINT", () => {
        cleanup();
        process.exit(130);
      });
      process.on("SIGTERM", () => {
        cleanup();
        process.exit(143);
      });
      return true;
    } catch {
      const pid = readLockPid();
      if (Number.isFinite(pid) && isProcessRunning(pid)) {
        console.log("Already running");
        return false;
      }
      removeLock();
    }
  }
}

function waitForAnyKey() {
  console.log("\nPress any key to close...");
  return new Promise<void>((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    const canSetRawMode = typeof stdin.setRawMode === "function";
    const finish = () => {
      if (canSetRawMode) {
        stdin.setRawMode(wasRaw);
      }
      stdin.pause();
      resolve();
    };
    stdin.resume();
    if (canSetRawMode) {
      stdin.setRawMode(true);
    }
    stdin.once("data", finish);
  });
}

export async function main() {
  if (!acquireLock()) {
    await waitForAnyKey();
    return;
  }

  const start = Bun.nanoseconds();
  await startCrosshairOverlay();

  let workersRunning = false;

  function startWorkers() {
    if (workersRunning) return;
    stopWorkers();
    workersRunning = true;
    startPixelScanner();
    startLoopx2();
  }

  function stopWorkers() {
    workersRunning = false;
    stopPixelScanner();
    stopLoopx2();
  }

  startFocusMonitor((active) => {
    if (active) {
      startWorkers();
      winput.start();
      console.log("Roblox Focused");
    } else {
      stopWorkers();
      winput.stop();
      console.log("Roblox Unfocused");
    }
  });

  bindMouseEvents();
  console.log("started in", (Bun.nanoseconds() - start) / 1000000, "ms");
}

main();

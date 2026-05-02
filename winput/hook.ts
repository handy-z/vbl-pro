import type { NativeInputEvent } from "./types";
import { handleNativeKeyboardEvent } from "./keyboard/listener";
import { handleNativeMouseEvent } from "./mouse/listener";

const nativeInput = require("../native/input/input.node");

let isStarted = false;

export function startHook() {
  if (isStarted) return;
  isStarted = true;
  nativeInput.startHook((err: unknown, json: string) => {
    if (err) {
      console.error("input hook error", err);
      return;
    }
    const event = JSON.parse(json) as NativeInputEvent;
    handleNativeKeyboardEvent(event);
    handleNativeMouseEvent(event);
  });
}

export function stopHook() {
  if (!isStarted) return;
  nativeInput.stopHook();
  isStarted = false;
}

export function ensureStarted() {
  startHook();
}

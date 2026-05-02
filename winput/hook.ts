import type { NativeInputEvent } from "./types";
import { nativeInput } from "./native";

let isStarted = false;
const handlers: ((event: NativeInputEvent) => void)[] = [];

export function registerNativeHandler(handler: (event: NativeInputEvent) => void) {
  handlers.push(handler);
}

export function startHook() {
  if (isStarted) return;
  isStarted = true;
  nativeInput.startHook((err: unknown, json: string) => {
    if (err) {
      console.error("input hook error", err);
      return;
    }
    const event = JSON.parse(json) as NativeInputEvent;
    for (const handler of handlers) handler(event);
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

export { keyboard } from "./keyboard";
export { mouse } from "./mouse";
export { sleep } from "keysender";
export type { Key, RegularKey, SpecKey, MouseBtn, Position, KeyboardEvent, MouseEvent, MouseWheelEvent, MouseMoveEvent } from "./types";
export { UiohookKey, EventType, WheelDirection } from "uiohook-napi";

import { keyboard } from "./keyboard";
import { mouse } from "./mouse";
import { uIOhook } from "uiohook-napi";

export function start() {
  uIOhook.start();
}

export function stop() {
  uIOhook.stop();
}

const winput = { keyboard, mouse, start, stop } as const;
export default winput;

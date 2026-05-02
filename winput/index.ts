export { keyboard } from "./keyboard";
export { mouse } from "./mouse";
export { sleep } from "./utils";
export type { Key, RegularKey, SpecKey, MouseBtn, Position, KeyboardEvent, MouseEvent, MouseWheelEvent, MouseMoveEvent } from "./types";
export { UiohookKey, EventType, WheelDirection } from "./utils";

import { keyboard } from "./keyboard";
import { mouse } from "./mouse";
import { startHook, stopHook } from "./hook";

export function start() {
  startHook();
}

export function stop() {
  stopHook();
}

const winput = { keyboard, mouse, start, stop } as const;
export default winput;

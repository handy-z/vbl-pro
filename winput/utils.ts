import type { KeyboardEvent, MouseBtn, MouseEvent, MouseWheelEvent, NativeInputEvent } from "./types";

const MODIFIER_KEYS = new Set([
  "ctrl", "rCtrl", "shift", "rShift", "alt", "rAlt", "lWin", "rWin",
]);

export const UIOHOOK_TO_KEY: Record<number, string> = {
  1: "escape", 14: "backspace", 15: "tab", 28: "enter", 29: "ctrl",
  42: "shift", 54: "rShift", 56: "alt", 57: "space", 58: "capsLock",
  59: "f1", 60: "f2", 61: "f3", 62: "f4", 63: "f5", 64: "f6",
  65: "f7", 66: "f8", 67: "f9", 68: "f10", 69: "numLock", 70: "scrollLock",
  71: "num7", 72: "num8", 73: "num9", 74: "num-", 75: "num4", 76: "num5",
  77: "num6", 78: "num+", 79: "num1", 80: "num2", 81: "num3", 82: "num0",
  83: "num.", 55: "num*", 87: "f11", 88: "f12",
  91: "f13", 92: "f14", 93: "f15", 99: "f16", 100: "f17", 101: "f18",
  102: "f19", 103: "f20", 104: "f21", 105: "f22", 106: "f23", 107: "f24",
  2: "1", 3: "2", 4: "3", 5: "4", 6: "5", 7: "6", 8: "7", 9: "8", 10: "9", 11: "0",
  12: "-", 13: "=", 26: "[", 27: "]", 39: ";", 40: "'", 41: "`",
  43: "\\", 44: "z", 45: "x", 46: "c", 47: "v", 48: "b", 49: "n", 50: "m",
  51: ",", 52: ".", 53: "/",
  30: "a", 31: "s", 32: "d", 33: "f", 34: "g", 35: "h", 36: "j", 37: "k", 38: "l",
  16: "q", 17: "w", 18: "e", 19: "r", 20: "t", 21: "y", 22: "u", 23: "i", 24: "o", 25: "p",
  3613: "rCtrl", 3637: "num/", 3639: "printScreen", 3640: "rAlt",
  3655: "home", 3657: "pageUp", 3663: "end", 3665: "pageDown",
  3666: "insert", 3667: "delete", 3675: "lWin", 3676: "rWin",
  57416: "up", 57419: "left", 57421: "right", 57424: "down",
};

export const EventType = {
  EVENT_KEY_PRESSED: "keydown",
  EVENT_KEY_RELEASED: "keyup",
  EVENT_MOUSE_PRESSED: "mousedown",
  EVENT_MOUSE_RELEASED: "mouseup",
  EVENT_MOUSE_MOVED: "mousemove",
  EVENT_MOUSE_WHEEL: "wheel",
} as const;

export const WheelDirection = {
  VERTICAL: 3,
  HORIZONTAL: 4,
} as const;

export const UiohookKey = UIOHOOK_TO_KEY;

export function enrichKeyboardEvent(e: NativeInputEvent, heldKeys: Set<number>): KeyboardEvent {
  const keycode = e.keycode ?? 0;
  const key = UIOHOOK_TO_KEY[keycode] ?? `unknown(${keycode})`;
  return {
    ...e,
    keycode,
    key,
    isModifier: MODIFIER_KEYS.has(key),
    isRepeat: heldKeys.has(keycode),
  };
}

export const MOUSE_BUTTON_MAP: Record<number, MouseBtn> = {
  1: "left",
  2: "right",
  3: "middle",
  4: "x1",
  5: "x2",
};

export function enrichMouseEvent(e: NativeInputEvent): MouseEvent {
  const button = e.button ?? 0;
  return {
    ...e,
    button,
    x: e.x ?? 0,
    y: e.y ?? 0,
    btn: MOUSE_BUTTON_MAP[button] ?? ("left" as MouseBtn),
  };
}

export function enrichWheelEvent(e: NativeInputEvent): MouseWheelEvent {
  const VERTICAL = 3;
  const direction = e.direction ?? VERTICAL;
  const rotation = e.rotation ?? 0;
  let dir: "up" | "down" | "left" | "right";
  if (direction === VERTICAL) {
    dir = rotation < 0 ? "up" : "down";
  } else {
    dir = rotation < 0 ? "left" : "right";
  }
  return { ...e, direction, rotation, dir };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
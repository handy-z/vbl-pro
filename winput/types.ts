import type { KeyboardButton, KeyboardRegularButton, KeyboardSpecButton, MouseButton } from "keysender";
import type { UiohookKeyboardEvent, UiohookMouseEvent, UiohookWheelEvent } from "uiohook-napi";

export type Key = KeyboardButton;
export type RegularKey = KeyboardRegularButton;
export type SpecKey = KeyboardSpecButton;
export type MouseBtn = MouseButton;

export type KeyboardEvent = UiohookKeyboardEvent & {
  key: string;
  isModifier: boolean;
  isRepeat: boolean;
};

export type MouseEvent = UiohookMouseEvent & {
  btn: MouseBtn;
};

export type MouseWheelEvent = UiohookWheelEvent & {
  dir: "up" | "down" | "left" | "right";
};

export type MouseMoveEvent = UiohookMouseEvent;

export type Position = {
  x: number;
  y: number;
};

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

export function enrichKeyboardEvent(e: UiohookKeyboardEvent, heldKeys: Set<number>): KeyboardEvent {
  const key = UIOHOOK_TO_KEY[e.keycode] ?? `unknown(${e.keycode})`;
  return {
    ...e,
    key,
    isModifier: MODIFIER_KEYS.has(key),
    isRepeat: heldKeys.has(e.keycode),
  };
}

export const MOUSE_BUTTON_MAP: Record<number, MouseBtn> = {
  1: "left",
  2: "right",
  3: "middle",
  4: "x1",
  5: "x2",
};

export function enrichMouseEvent(e: UiohookMouseEvent): MouseEvent {
  return {
    ...e,
    btn: MOUSE_BUTTON_MAP[e.button as number] ?? ("unknown" as MouseBtn),
  };
}

export function enrichWheelEvent(e: UiohookWheelEvent): MouseWheelEvent {
  const VERTICAL = 3;
  let dir: "up" | "down" | "left" | "right";
  if (e.direction === VERTICAL) {
    dir = e.rotation < 0 ? "up" : "down";
  } else {
    dir = e.rotation < 0 ? "left" : "right";
  }
  return { ...e, dir };
}

const TOGGLE_VK: Record<string, number> = {
  capsLock: 0x14,
  numLock: 0x90,
  scrollLock: 0x91,
};

let _user32: any = null;
function getUser32() {
  if (!_user32) {
    const { dlopen, FFIType } = require("bun:ffi");
    _user32 = dlopen("user32.dll", {
      GetKeyState: { args: [FFIType.i32], returns: FFIType.i16 },
    });
  }
  return _user32;
}

export function getToggleState(key: string): boolean {
  const vk = TOGGLE_VK[key];
  if (vk === undefined) return false;
  return (getUser32().symbols.GetKeyState(vk) & 1) === 1;
}

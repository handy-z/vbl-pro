export type RegularKey =
  | "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m"
  | "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z"
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "-" | "=" | "[" | "]" | "\\" | ";" | "'" | "`" | "," | "." | "/";

export type SpecKey =
  | "escape" | "backspace" | "tab" | "enter" | "ctrl" | "rCtrl" | "shift" | "rShift"
  | "alt" | "rAlt" | "lWin" | "rWin" | "space" | "capsLock" | "numLock" | "scrollLock"
  | "insert" | "delete" | "home" | "end" | "pageUp" | "pageDown" | "left" | "right"
  | "up" | "down" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6" | "f7" | "f8"
  | "f9" | "f10" | "f11" | "f12";

export type Key = RegularKey | SpecKey;
export type MouseBtn = "left" | "right" | "middle" | "x1" | "x2";

export type NativeInputEvent = {
  type: string;
  keycode?: number;
  rawcode?: number;
  scanCode?: number;
  altKey?: boolean;
  button?: number;
  x?: number;
  y?: number;
  clicks?: number;
  rotation?: number;
  direction?: number;
  time?: number;
};

export type KeyboardEvent = NativeInputEvent & {
  keycode: number;
  key: string;
  isModifier: boolean;
  isRepeat: boolean;
};

export type MouseEvent = NativeInputEvent & {
  button: number;
  x: number;
  y: number;
  btn: MouseBtn;
};

export type MouseWheelEvent = NativeInputEvent & {
  rotation: number;
  direction: number;
  dir: "up" | "down" | "left" | "right";
};

export type MouseMoveEvent = NativeInputEvent & {
  x: number;
  y: number;
};

export type Position = {
  x: number;
  y: number;
};

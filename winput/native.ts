type NativeInput = {
  keyDown(key: string): void;
  keyUp(key: string): void;
  keyTap(key: string, delayMs?: number | null): void;
  writeText(text: string, charDelayMs?: number | null): void;
  isKeyDown(key: string): boolean;
  getToggleState(key: string): boolean;
  mouseDown(button: string): void;
  mouseUp(button: string): void;
  mouseClick(button: string, delayMs?: number | null): void;
  mouseMoveTo(x: number, y: number): void;
  mouseMoveBy(dx: number, dy: number): void;
  mouseWheel(amount: number): void;
  mousePosition(): number[];
  isMouseDown(button: string): boolean;
  startHook(callback: (err: unknown, json: string) => void): void;
  stopHook(): void;
};

export const nativeInput = require("../native/input/input.node") as NativeInput;

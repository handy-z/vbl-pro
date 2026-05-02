declare var self: Worker;

import { dlopen, FFIType, ptr } from "bun:ffi";
import { GameState } from "../state";

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const TARGET = "RobloxPlayerBeta.exe";

const { symbols: user32 } = dlopen("user32", {
  GetForegroundWindow: { returns: FFIType.ptr, args: [] },
  GetWindowThreadProcessId: { returns: FFIType.u32, args: [FFIType.ptr, FFIType.ptr] },
});

const { symbols: kernel32 } = dlopen("kernel32", {
  OpenProcess: { returns: FFIType.ptr, args: [FFIType.u32, FFIType.i32, FFIType.u32] },
  QueryFullProcessImageNameW: { returns: FFIType.i32, args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr] },
  CloseHandle: { returns: FFIType.i32, args: [FFIType.ptr] },
});

const pidBuf = new Uint32Array(1);
const nameBuf = new Uint16Array(512);
const sizeBuf = new Uint32Array(1);
const decoder = new TextDecoder("utf-16");

function getForegroundProcessName(): string | null {
  const hwnd = user32.GetForegroundWindow();
  if (!hwnd) return null;

  pidBuf[0] = 0;
  user32.GetWindowThreadProcessId(hwnd, ptr(pidBuf));
  const pid = pidBuf[0];
  if (!pid) return null;

  const handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (!handle) return null;

  sizeBuf[0] = 512;
  const ok = kernel32.QueryFullProcessImageNameW(handle, 0, ptr(nameBuf), ptr(sizeBuf));
  kernel32.CloseHandle(handle);
  if (!ok) return null;

  const bytes = new Uint8Array(nameBuf.buffer, 0, sizeBuf[0] * 2);
  const fullPath = decoder.decode(bytes);
  return fullPath.split("\\").pop() ?? null;
}

let state: GameState;
let lastFocused: boolean | null = null;

self.onmessage = (e: MessageEvent) => {
  if (e.data.type === "init") {
    state = GameState.from({ sab: e.data.sab, slots: e.data.slots });
    loop();
  }
};

async function loop() {
  while (true) {
    const name = getForegroundProcessName();
    const focused = name === TARGET;

    if (focused !== lastFocused) {
      lastFocused = focused;
      state.set("robloxFocused", focused ? 1 : 0);
      self.postMessage({ type: "focus", active: focused });
    }

    await Bun.sleep(200);
  }
}

import { uIOhook } from "uiohook-napi";
import type { MouseBtn, MouseEvent, MouseMoveEvent, MouseWheelEvent } from "../types";
import { enrichMouseEvent, enrichWheelEvent } from "../types";

let started = false;
function ensureStarted() {
  if (!started) {
    started = true;
    uIOhook.start();
  }
}

type AllBtnCallback = (event: MouseEvent) => void;
type FilteredBtnCallback = (event: MouseEvent) => void;
type MoveCallback = (event: MouseMoveEvent) => void;
type WheelCallback = (event: MouseWheelEvent) => void;

const downAll: AllBtnCallback[] = [];
const upAll: AllBtnCallback[] = [];
const downFiltered = new Map<MouseBtn, FilteredBtnCallback[]>();
const upFiltered = new Map<MouseBtn, FilteredBtnCallback[]>();
const moveListeners: MoveCallback[] = [];
const wheelListeners: WheelCallback[] = [];

function removeFrom<T>(arr: T[], item: T) {
  const i = arr.indexOf(item);
  if (i !== -1) arr.splice(i, 1);
}

function emit<T>(listeners: readonly ((event: T) => void)[], event: T) {
  for (const listener of [...listeners]) listener(event);
}

let hooked = false;
function ensureHooked() {
  if (hooked) return;
  hooked = true;

  uIOhook.on("mousedown", (e) => {
    const event = enrichMouseEvent(e);
    emit(downAll, event);
    const cbs = downFiltered.get(event.btn);
    if (cbs) emit(cbs, event);
  });

  uIOhook.on("mouseup", (e) => {
    const event = enrichMouseEvent(e);
    emit(upAll, event);
    const cbs = upFiltered.get(event.btn);
    if (cbs) emit(cbs, event);
  });

  uIOhook.on("mousemove", (e) => {
    emit(moveListeners, e);
  });

  uIOhook.on("wheel", (e) => {
    const event = enrichWheelEvent(e);
    emit(wheelListeners, event);
  });
}

export function on(event: "down", callback: AllBtnCallback): () => void;
export function on(event: "down", button: MouseBtn, callback: FilteredBtnCallback): () => void;
export function on(event: "up", callback: AllBtnCallback): () => void;
export function on(event: "up", button: MouseBtn, callback: FilteredBtnCallback): () => void;
export function on(event: "move", callback: MoveCallback): () => void;
export function on(event: "wheel", callback: WheelCallback): () => void;
export function on(
  event: "down" | "up" | "move" | "wheel",
  btnOrCb?: MouseBtn | AllBtnCallback | MoveCallback | WheelCallback,
  cb?: FilteredBtnCallback,
): () => void {
  ensureStarted();
  ensureHooked();

  if (event === "move") {
    const callback = btnOrCb as MoveCallback;
    moveListeners.push(callback);
    return () => removeFrom(moveListeners, callback);
  }

  if (event === "wheel") {
    const callback = btnOrCb as WheelCallback;
    wheelListeners.push(callback);
    return () => removeFrom(wheelListeners, callback);
  }

  if (typeof btnOrCb === "function") {
    const list = event === "down" ? downAll : upAll;
    const callback = btnOrCb as AllBtnCallback;
    list.push(callback);
    return () => removeFrom(list, callback);
  }

  const button = btnOrCb as MouseBtn;
  const map = event === "down" ? downFiltered : upFiltered;
  if (!map.has(button)) map.set(button, []);
  map.get(button)!.push(cb!);
  return () => {
    const arr = map.get(button);
    if (arr) removeFrom(arr, cb!);
  };
}

export function once(event: "down", callback: AllBtnCallback): () => void;
export function once(event: "down", button: MouseBtn, callback: FilteredBtnCallback): () => void;
export function once(event: "up", callback: AllBtnCallback): () => void;
export function once(event: "up", button: MouseBtn, callback: FilteredBtnCallback): () => void;
export function once(event: "move", callback: MoveCallback): () => void;
export function once(event: "wheel", callback: WheelCallback): () => void;
export function once(
  event: "down" | "up" | "move" | "wheel",
  btnOrCb?: MouseBtn | AllBtnCallback | MoveCallback | WheelCallback,
  cb?: FilteredBtnCallback,
): () => void {
  if (event === "move") {
    const orig = btnOrCb as MoveCallback;
    const wrapper: MoveCallback = (e) => { unsub(); orig(e); };
    const unsub = on("move", wrapper);
    return unsub;
  }
  if (event === "wheel") {
    const orig = btnOrCb as WheelCallback;
    const wrapper: WheelCallback = (e) => { unsub(); orig(e); };
    const unsub = on("wheel", wrapper);
    return unsub;
  }
  if (typeof btnOrCb === "function") {
    const orig = btnOrCb as AllBtnCallback;
    const wrapper: AllBtnCallback = (e) => { unsub(); orig(e); };
    const unsub = on(event as "down", wrapper);
    return unsub;
  }
  const orig = cb!;
  const wrapper: FilteredBtnCallback = (e) => { unsub(); orig(e); };
  const unsub = on(event as "down", btnOrCb as MouseBtn, wrapper);
  return unsub;
}

export function off(event: "down"): void;
export function off(event: "down", button: MouseBtn): void;
export function off(event: "up"): void;
export function off(event: "up", button: MouseBtn): void;
export function off(event: "move"): void;
export function off(event: "wheel"): void;
export function off(event: "down" | "up" | "move" | "wheel", button?: MouseBtn): void {
  if (event === "move") { moveListeners.length = 0; return; }
  if (event === "wheel") { wheelListeners.length = 0; return; }
  if (button === undefined) {
    const list = event === "down" ? downAll : upAll;
    list.length = 0;
  } else {
    const map = event === "down" ? downFiltered : upFiltered;
    map.delete(button);
  }
}

export function waitClick(button?: MouseBtn, timeout?: number): Promise<MouseEvent> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsub: () => void;
    if (button) {
      unsub = once("down" as "down", button, (e) => {
        if (timer) clearTimeout(timer);
        resolve(e);
      });
    } else {
      unsub = once("down" as "down", (e) => {
        if (timer) clearTimeout(timer);
        resolve(e);
      });
    }
    if (timeout !== undefined) {
      timer = setTimeout(() => {
        unsub();
        reject(new Error(`waitClick timed out after ${timeout}ms`));
      }, timeout);
    }
  });
}

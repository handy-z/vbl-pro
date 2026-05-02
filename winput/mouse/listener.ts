import { ensureStarted, registerNativeHandler } from "../hook";
import type { MouseBtn, MouseEvent, MouseMoveEvent, MouseWheelEvent, NativeInputEvent } from "../types";
import { enrichMouseEvent, enrichWheelEvent } from "../utils";
import { FilteredListeners, ListenerList } from "../listeners";

type AllBtnCallback = (event: MouseEvent) => void;
type FilteredBtnCallback = (event: MouseEvent) => void;
type MoveCallback = (event: MouseMoveEvent) => void;
type WheelCallback = (event: MouseWheelEvent) => void;

const downAll = new ListenerList<MouseEvent>();
const upAll = new ListenerList<MouseEvent>();
const downFiltered = new FilteredListeners<MouseBtn, MouseEvent>();
const upFiltered = new FilteredListeners<MouseBtn, MouseEvent>();
const moveListeners = new ListenerList<MouseMoveEvent>();
const wheelListeners = new ListenerList<MouseWheelEvent>();

export function handleNativeMouseEvent(e: NativeInputEvent) {
  if (e.type === "mousedown") {
    const event = enrichMouseEvent(e);
    downAll.emit(event);
    downFiltered.emit(event.btn, event);
  } else if (e.type === "mouseup") {
    const event = enrichMouseEvent(e);
    upAll.emit(event);
    upFiltered.emit(event.btn, event);
  } else if (e.type === "mousemove") {
    moveListeners.emit({ ...e, x: e.x ?? 0, y: e.y ?? 0 });
  } else if (e.type === "wheel") {
    const event = enrichWheelEvent(e);
    wheelListeners.emit(event);
  }
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

  if (event === "move") {
    const callback = btnOrCb as MoveCallback;
    return moveListeners.add(callback);
  }

  if (event === "wheel") {
    const callback = btnOrCb as WheelCallback;
    return wheelListeners.add(callback);
  }

  if (typeof btnOrCb === "function") {
    const callback = btnOrCb as AllBtnCallback;
    return (event === "down" ? downAll : upAll).add(callback);
  }

  const button = btnOrCb as MouseBtn;
  return (event === "down" ? downFiltered : upFiltered).add(button, cb!);
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
    let unsub: () => void;
    const wrapper: MoveCallback = (e) => { unsub(); orig(e); };
    unsub = on("move", wrapper);
    return unsub;
  }
  if (event === "wheel") {
    const orig = btnOrCb as WheelCallback;
    let unsub: () => void;
    const wrapper: WheelCallback = (e) => { unsub(); orig(e); };
    unsub = on("wheel", wrapper);
    return unsub;
  }
  if (typeof btnOrCb === "function") {
    const orig = btnOrCb as AllBtnCallback;
    let unsub: () => void;
    const wrapper: AllBtnCallback = (e) => { unsub(); orig(e); };
    unsub = on(event as "down", wrapper);
    return unsub;
  }
  const orig = cb!;
  let unsub: () => void;
  const wrapper: FilteredBtnCallback = (e) => { unsub(); orig(e); };
  unsub = on(event as "down", btnOrCb as MouseBtn, wrapper);
  return unsub;
}

export function off(event: "down"): void;
export function off(event: "down", button: MouseBtn): void;
export function off(event: "up"): void;
export function off(event: "up", button: MouseBtn): void;
export function off(event: "move"): void;
export function off(event: "wheel"): void;
export function off(event: "down" | "up" | "move" | "wheel", button?: MouseBtn): void {
  if (event === "move") { moveListeners.clear(); return; }
  if (event === "wheel") { wheelListeners.clear(); return; }
  if (button === undefined) {
    (event === "down" ? downAll : upAll).clear();
  } else {
    (event === "down" ? downFiltered : upFiltered).clear(button);
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

registerNativeHandler(handleNativeMouseEvent);

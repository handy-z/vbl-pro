import type { Key, KeyboardEvent, NativeInputEvent } from "../types";
import { UIOHOOK_TO_KEY, enrichKeyboardEvent } from "../utils";
import { ensureStarted, registerNativeHandler } from "../hook";
import { FilteredListeners, ListenerList } from "../listeners";

type AllKeyCallback = (event: KeyboardEvent) => void;
type FilteredKeyCallback = (event: KeyboardEvent) => void;

const downAll = new ListenerList<KeyboardEvent>();
const upAll = new ListenerList<KeyboardEvent>();
const downFiltered = new FilteredListeners<string, KeyboardEvent>();
const upFiltered = new FilteredListeners<string, KeyboardEvent>();

const heldKeys = new Set<number>();

export function handleNativeKeyboardEvent(e: NativeInputEvent) {
  if (e.type === "keydown") {
    const event = enrichKeyboardEvent(e, heldKeys);
    heldKeys.add(event.keycode);
    downAll.emit(event);
    const key = UIOHOOK_TO_KEY[event.keycode];
    if (key) downFiltered.emit(key, event);
  } else if (e.type === "keyup") {
    const keycode = e.keycode ?? 0;
    heldKeys.delete(keycode);
    const event = enrichKeyboardEvent(e, heldKeys);
    upAll.emit(event);
    const key = UIOHOOK_TO_KEY[event.keycode];
    if (key) upFiltered.emit(key, event);
  }
}

export function on(event: "down", callback: AllKeyCallback): () => void;
export function on(event: "down", key: Key, callback: FilteredKeyCallback): () => void;
export function on(event: "up", callback: AllKeyCallback): () => void;
export function on(event: "up", key: Key, callback: FilteredKeyCallback): () => void;
export function on(
  event: "down" | "up",
  keyOrCb: Key | AllKeyCallback,
  cb?: FilteredKeyCallback,
): () => void {
  ensureStarted();

  if (typeof keyOrCb === "function") {
    return (event === "down" ? downAll : upAll).add(keyOrCb);
  }

  const key = String(keyOrCb);
  return (event === "down" ? downFiltered : upFiltered).add(key, cb!);
}

const onKey = on as (
  event: "down" | "up",
  keyOrCb: Key | AllKeyCallback,
  cb?: FilteredKeyCallback,
) => () => void;

export function once(event: "down", callback: AllKeyCallback): () => void;
export function once(event: "down", key: Key, callback: FilteredKeyCallback): () => void;
export function once(event: "up", callback: AllKeyCallback): () => void;
export function once(event: "up", key: Key, callback: FilteredKeyCallback): () => void;
export function once(
  event: "down" | "up",
  keyOrCb: Key | AllKeyCallback,
  cb?: FilteredKeyCallback,
): () => void {
  if (typeof keyOrCb === "function") {
    let unsub: () => void;
    const wrapper: AllKeyCallback = (e) => { unsub(); keyOrCb(e); };
    unsub = onKey(event, wrapper);
    return unsub;
  }
  let unsub: () => void;
  const wrapper: FilteredKeyCallback = (e) => { unsub(); cb!(e); };
  unsub = onKey(event, keyOrCb as Key, wrapper);
  return unsub;
}

export function off(event: "down"): void;
export function off(event: "down", key: Key): void;
export function off(event: "up"): void;
export function off(event: "up", key: Key): void;
export function off(event: "down" | "up", key?: Key): void {
  if (key === undefined) {
    (event === "down" ? downAll : upAll).clear();
  } else {
    (event === "down" ? downFiltered : upFiltered).clear(String(key));
  }
}

export function waitDown(key: Key, timeout?: number): Promise<KeyboardEvent> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = once("down", key as Key, (e) => {
      if (timer) clearTimeout(timer);
      resolve(e);
    });
    if (timeout !== undefined) {
      timer = setTimeout(() => {
        unsub();
        reject(new Error(`waitDown("${key}") timed out after ${timeout}ms`));
      }, timeout);
    }
  });
}

export function waitUp(key: Key, timeout?: number): Promise<KeyboardEvent> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = once("up", key as Key, (e) => {
      if (timer) clearTimeout(timer);
      resolve(e);
    });
    if (timeout !== undefined) {
      timer = setTimeout(() => {
        unsub();
        reject(new Error(`waitUp("${key}") timed out after ${timeout}ms`));
      }, timeout);
    }
  });
}

registerNativeHandler(handleNativeKeyboardEvent);

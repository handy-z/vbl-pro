import type { Key, KeyboardEvent, NativeInputEvent } from "../types";
import { UIOHOOK_TO_KEY, enrichKeyboardEvent } from "../utils";
import { ensureStarted } from "../hook";

type AllKeyCallback = (event: KeyboardEvent) => void;
type FilteredKeyCallback = (event: KeyboardEvent) => void;

const downAll: AllKeyCallback[] = [];
const upAll: AllKeyCallback[] = [];
const downFiltered = new Map<string, FilteredKeyCallback[]>();
const upFiltered = new Map<string, FilteredKeyCallback[]>();

const heldKeys = new Set<number>();

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
}

export function handleNativeKeyboardEvent(e: NativeInputEvent) {
  if (e.type === "keydown") {
    const event = enrichKeyboardEvent(e, heldKeys);
    heldKeys.add(event.keycode);
    emit(downAll, event);
    const key = UIOHOOK_TO_KEY[event.keycode];
    if (key) {
      const cbs = downFiltered.get(key);
      if (cbs) emit(cbs, event);
    }
  } else if (e.type === "keyup") {
    const keycode = e.keycode ?? 0;
    heldKeys.delete(keycode);
    const event = enrichKeyboardEvent(e, heldKeys);
    emit(upAll, event);
    const key = UIOHOOK_TO_KEY[event.keycode];
    if (key) {
      const cbs = upFiltered.get(key);
      if (cbs) emit(cbs, event);
    }
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
  ensureHooked();

  if (typeof keyOrCb === "function") {
    const list = event === "down" ? downAll : upAll;
    list.push(keyOrCb);
    return () => removeFrom(list, keyOrCb);
  }

  const key = String(keyOrCb);
  const map = event === "down" ? downFiltered : upFiltered;
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(cb!);
  return () => {
    const arr = map.get(key);
    if (arr) removeFrom(arr, cb!);
  };
}

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
    const wrapper: AllKeyCallback = (e) => { off(); keyOrCb(e); };
    const off = on(event as "down", wrapper);
    return off;
  }
  const wrapper: FilteredKeyCallback = (e) => { off(); cb!(e); };
  const off = on(event as "down", keyOrCb as Key, wrapper);
  return off;
}

export function off(event: "down"): void;
export function off(event: "down", key: Key): void;
export function off(event: "up"): void;
export function off(event: "up", key: Key): void;
export function off(event: "down" | "up", key?: Key): void {
  if (key === undefined) {
    const list = event === "down" ? downAll : upAll;
    list.length = 0;
  } else {
    const map = event === "down" ? downFiltered : upFiltered;
    map.delete(String(key));
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

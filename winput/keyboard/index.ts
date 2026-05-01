import * as action from "./action";
import * as listener from "./listener";
import type { Key, KeyboardEvent } from "../types";
import type { Delay } from "keysender";

type AllKeyCallback = (event: KeyboardEvent) => void;
type FilteredKeyCallback = (event: KeyboardEvent) => void;

export interface Keyboard {
  tap(key: Key, delay?: number): action.InputChain;
  down(key: Key): action.InputChain;
  up(key: Key): action.InputChain;
  write(text: string, charDelayMs?: number, humanize?: boolean): action.InputChain;
  toggle(key: Key | Key[], state: boolean, delay?: Delay): action.InputChain;
  shortcut(...combo: Key[]): action.InputChain;
  hold(key: Key, durationMs: number): action.InputChain;
  sequence(keys: Key[], delay?: number): action.InputChain;
  isDown(key: Key): boolean;
  getState(key: string): boolean;
  waitDown(key: Key, timeout?: number): Promise<KeyboardEvent>;
  waitUp(key: Key, timeout?: number): Promise<KeyboardEvent>;
  on(event: "down", callback: AllKeyCallback): () => void;
  on(event: "down", key: Key, callback: FilteredKeyCallback): () => void;
  on(event: "up", callback: AllKeyCallback): () => void;
  on(event: "up", key: Key, callback: FilteredKeyCallback): () => void;
  once(event: "down", callback: AllKeyCallback): () => void;
  once(event: "down", key: Key, callback: FilteredKeyCallback): () => void;
  once(event: "up", callback: AllKeyCallback): () => void;
  once(event: "up", key: Key, callback: FilteredKeyCallback): () => void;
  off(event: "down"): void;
  off(event: "down", key: Key): void;
  off(event: "up"): void;
  off(event: "up", key: Key): void;
}

export const keyboard: Keyboard = {
  tap: action.tap,
  down: action.down,
  up: action.up,
  write: action.write,
  toggle: action.toggle,
  shortcut: action.shortcut,
  hold: action.hold,
  sequence: action.sequence,
  isDown: action.isDown,
  getState: action.getState,
  waitDown: listener.waitDown,
  waitUp: listener.waitUp,
  on: listener.on as Keyboard["on"],
  once: listener.once as Keyboard["once"],
  off: listener.off as Keyboard["off"],
};

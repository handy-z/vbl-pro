import type { Key } from "../types";
import { sleep } from "../utils";

const nativeInput = require("../../native/input/input.node");

export type Delay = number;

export class InputChain implements PromiseLike<void> {
  private promise: Promise<void>;

  constructor(initial: Promise<void>) {
    this.promise = initial;
  }

  wait(ms: number): InputChain {
    this.promise = this.promise.then(() => sleep(ms));
    return this;
  }

  down(key: Key): InputChain {
    this.promise = this.promise.then(() => nativeInput.keyDown(key));
    return this;
  }

  up(key: Key): InputChain {
    this.promise = this.promise.then(() => nativeInput.keyUp(key));
    return this;
  }

  tap(key: Key, delay?: number): InputChain {
    this.promise = this.promise.then(() => nativeInput.keyTap(key, delay));
    return this;
  }

  toggle(key: Key | Key[], state: boolean, delay?: Delay): InputChain {
    this.promise = this.promise.then(async () => {
      const keys = Array.isArray(key) ? key : [key];
      for (const item of keys) {
        state ? nativeInput.keyDown(item) : nativeInput.keyUp(item);
        if (delay) await sleep(delay);
      }
    });
    return this;
  }

  write(text: string, charDelayMs?: number, humanize?: boolean): InputChain {
    this.promise = this.promise.then(async () => {
      if (humanize && charDelayMs) {
        for (const ch of text) {
          nativeInput.writeText(ch);
          const min = Math.floor(charDelayMs * 0.5);
          const max = Math.floor(charDelayMs * 1.5);
          await sleep(min + Math.floor(Math.random() * (max - min + 1)));
        }
      } else {
        nativeInput.writeText(text, charDelayMs);
      }
    });
    return this;
  }

  shortcut(...combo: Key[]): InputChain {
    this.promise = this.promise.then(async () => {
      if (combo.length === 0) return;
      const mainKey = combo.at(-1)!;
      const modifiers = combo.slice(0, -1);
      for (const mod of modifiers) nativeInput.keyDown(mod);
      nativeInput.keyTap(mainKey);
      for (const mod of modifiers.toReversed()) nativeInput.keyUp(mod);
    });
    return this;
  }

  hold(key: Key, durationMs: number): InputChain {
    return this.down(key).wait(durationMs).up(key);
  }

  sequence(keys: Key[], delay: number = 35): InputChain {
    this.promise = this.promise.then(async () => {
      const lastIndex = keys.length - 1;
      for (const [index, key] of keys.entries()) {
        nativeInput.keyTap(key);
        if (index < lastIndex) await sleep(delay);
      }
    });
    return this;
  }

  then<T = void, R = never>(
    onfulfilled?: ((value: void) => T | PromiseLike<T>) | null,
    onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null,
  ): Promise<T | R> {
    return this.promise.then(onfulfilled, onrejected);
  }
}

export function tap(key: Key, delay?: number): InputChain {
  return new InputChain(Promise.resolve(nativeInput.keyTap(key, delay)));
}

export function down(key: Key): InputChain {
  return new InputChain(Promise.resolve(nativeInput.keyDown(key)));
}

export function up(key: Key): InputChain {
  return new InputChain(Promise.resolve(nativeInput.keyUp(key)));
}

export function write(text: string, charDelayMs?: number, humanize?: boolean): InputChain {
  return new InputChain(Promise.resolve()).write(text, charDelayMs, humanize);
}

export function toggle(key: Key | Key[], state: boolean, delay?: Delay): InputChain {
  return new InputChain(Promise.resolve()).toggle(key, state, delay);
}

export function shortcut(...combo: Key[]): InputChain {
  return new InputChain(Promise.resolve()).shortcut(...combo);
}

export function hold(key: Key, durationMs: number): InputChain {
  return down(key).wait(durationMs).up(key);
}

export function sequence(keys: Key[], delay: number = 35): InputChain {
  return new InputChain(Promise.resolve()).sequence(keys, delay);
}

export function isDown(key: Key): boolean {
  return nativeInput.isKeyDown(key);
}

export function getState(key: string): boolean {
  return nativeInput.getToggleState(key);
}

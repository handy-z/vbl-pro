import { Hardware, isButtonPressed, sleep } from "keysender";
import type { Delay } from "keysender";
import type { Key } from "../types";
import { getToggleState } from "../types";

const hw = new Hardware();

export { hw };

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
    this.promise = this.promise.then(() => hw.keyboard.toggleKey(key, true));
    return this;
  }

  up(key: Key): InputChain {
    this.promise = this.promise.then(() => hw.keyboard.toggleKey(key, false));
    return this;
  }

  tap(key: Key, delay?: number): InputChain {
    this.promise = this.promise.then(() => hw.keyboard.sendKey(key, delay));
    return this;
  }

  toggle(key: Key | Key[], state: boolean, delay?: Delay): InputChain {
    this.promise = this.promise.then(() => hw.keyboard.toggleKey(key, state, delay));
    return this;
  }

  write(text: string, charDelayMs?: number, humanize?: boolean): InputChain {
    this.promise = this.promise.then(async () => {
      if (humanize && charDelayMs) {
        const min = Math.floor(charDelayMs * 0.5);
        const max = Math.floor(charDelayMs * 1.5);
        await hw.keyboard.printText(text, [min, max]);
      } else {
        await hw.keyboard.printText(text, charDelayMs);
      }
    });
    return this;
  }

  shortcut(...combo: Key[]): InputChain {
    this.promise = this.promise.then(async () => {
      if (combo.length === 0) return;
      const mainKey = combo.at(-1)!;
      const modifiers = combo.slice(0, -1);
      for (const mod of modifiers) await hw.keyboard.toggleKey(mod, true);
      await hw.keyboard.sendKey(mainKey);
      for (const mod of modifiers.toReversed()) await hw.keyboard.toggleKey(mod, false);
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
        await hw.keyboard.sendKey(key);
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
  return new InputChain(hw.keyboard.sendKey(key, delay));
}

export function down(key: Key): InputChain {
  return new InputChain(hw.keyboard.toggleKey(key, true));
}

export function up(key: Key): InputChain {
  return new InputChain(hw.keyboard.toggleKey(key, false));
}

export function write(text: string, charDelayMs?: number, humanize?: boolean): InputChain {
  return new InputChain(Promise.resolve()).write(text, charDelayMs, humanize);
}

export function toggle(key: Key | Key[], state: boolean, delay?: Delay): InputChain {
  return new InputChain(hw.keyboard.toggleKey(key, state, delay));
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
  return isButtonPressed("keyboard", key);
}

export function getState(key: string): boolean {
  return getToggleState(key);
}

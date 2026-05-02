import type { Key } from "../types";
import { sleep } from "../utils";
import { nativeInput } from "../native";
import { Chain } from "../chain";

export type Delay = number;

export class InputChain extends Chain<InputChain> {
  down(key: Key): InputChain {
    return this.append(() => nativeInput.keyDown(key));
  }

  up(key: Key): InputChain {
    return this.append(() => nativeInput.keyUp(key));
  }

  tap(key: Key, delay?: number): InputChain {
    return this.append(() => nativeInput.keyTap(key, delay));
  }

  toggle(key: Key | Key[], state: boolean, delay?: Delay): InputChain {
    return this.append(async () => {
      const keys = Array.isArray(key) ? key : [key];
      for (const item of keys) {
        state ? nativeInput.keyDown(item) : nativeInput.keyUp(item);
        if (delay) await sleep(delay);
      }
    });
  }

  write(text: string, charDelayMs?: number, humanize?: boolean): InputChain {
    return this.append(async () => {
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
  }

  shortcut(...combo: Key[]): InputChain {
    return this.append(async () => {
      if (combo.length === 0) return;
      const mainKey = combo.at(-1)!;
      const modifiers = combo.slice(0, -1);
      for (const mod of modifiers) nativeInput.keyDown(mod);
      nativeInput.keyTap(mainKey);
      for (const mod of modifiers.toReversed()) nativeInput.keyUp(mod);
    });
  }

  hold(key: Key, durationMs: number): InputChain {
    return this.down(key).wait(durationMs).up(key);
  }

  sequence(keys: Key[], delay: number = 35): InputChain {
    return this.append(async () => {
      const lastIndex = keys.length - 1;
      for (const [index, key] of keys.entries()) {
        nativeInput.keyTap(key);
        if (index < lastIndex) await sleep(delay);
      }
    });
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

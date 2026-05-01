import { isButtonPressed, sleep } from "keysender";
import { hw } from "../keyboard/action";
import type { MouseBtn, Position } from "../types";

export class MouseChain implements PromiseLike<void> {
  private promise: Promise<void>;
  private lastButton: MouseBtn;

  constructor(initial: Promise<void>, button: MouseBtn = "left") {
    this.promise = initial;
    this.lastButton = button;
  }

  wait(ms: number): MouseChain {
    this.promise = this.promise.then(() => sleep(ms));
    return this;
  }

  down(button?: MouseBtn): MouseChain {
    const b = button ?? this.lastButton;
    this.lastButton = b;
    this.promise = this.promise.then(() => hw.mouse.toggle(b, true));
    return this;
  }

  up(button?: MouseBtn): MouseChain {
    const b = button ?? this.lastButton;
    this.promise = this.promise.then(() => hw.mouse.toggle(b, false));
    return this;
  }

  click(button?: MouseBtn, delay?: number): MouseChain {
    const b = button ?? this.lastButton;
    this.promise = this.promise.then(() => hw.mouse.click(b, delay));
    return this;
  }

  doubleClick(button?: MouseBtn, delay?: number): MouseChain {
    const b = button ?? this.lastButton;
    this.promise = this.promise.then(async () => {
      await hw.mouse.click(b, delay);
      await hw.mouse.click(b, delay);
    });
    return this;
  }

  move(x: number, y: number, duration?: number, smooth?: boolean): MouseChain {
    this.promise = this.promise.then(async () => {
      if (smooth && duration) {
        await hw.mouse.humanMoveTo(x, y, Math.max(1, Math.round(20 / (duration / 100))));
      } else if (duration) {
        await hw.mouse.moveTo(x, y, duration);
      } else {
        await hw.mouse.moveTo(x, y);
      }
    });
    return this;
  }

  moveBy(dx: number, dy: number, delay?: number): MouseChain {
    this.promise = this.promise.then(() => hw.mouse.move(dx, dy, delay));
    return this;
  }

  hold(button: MouseBtn | undefined, durationMs: number): MouseChain {
    const b = button ?? this.lastButton;
    return this.down(b).wait(durationMs).up(b);
  }

  wheel(amount: number, delay?: number): MouseChain {
    this.promise = this.promise.then(() => hw.mouse.scrollWheel(amount, delay));
    return this;
  }

  drag(fromX: number, fromY: number, toX: number, toY: number, button?: MouseBtn): MouseChain {
    const b = button ?? this.lastButton;
    this.promise = this.promise.then(async () => {
      await hw.mouse.moveTo(fromX, fromY);
      await hw.mouse.toggle(b, true, 35);
      await hw.mouse.humanMoveTo(toX, toY);
      await hw.mouse.toggle(b, false);
    });
    return this;
  }

  setPosition(pos: Position): MouseChain {
    this.promise = this.promise.then(() => hw.mouse.moveTo(pos.x, pos.y));
    return this;
  }

  then<T = void, R = never>(
    onfulfilled?: ((value: void) => T | PromiseLike<T>) | null,
    onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null,
  ): Promise<T | R> {
    return this.promise.then(onfulfilled, onrejected);
  }
}

export function click(button: MouseBtn = "left", delay?: number): MouseChain {
  return new MouseChain(hw.mouse.click(button, delay), button);
}

export function doubleClick(button: MouseBtn = "left", delay?: number): MouseChain {
  const chain = new MouseChain(Promise.resolve(), button);
  return chain.click(button, delay).click(button, delay);
}

export function tripleClick(button: MouseBtn = "left", delay?: number): MouseChain {
  const chain = new MouseChain(Promise.resolve(), button);
  return chain.click(button, delay).click(button, delay).click(button, delay);
}

export function down(button: MouseBtn = "left"): MouseChain {
  return new MouseChain(hw.mouse.toggle(button, true), button);
}

export function up(button: MouseBtn = "left"): MouseChain {
  return new MouseChain(hw.mouse.toggle(button, false), button);
}

export function move(x: number, y: number, duration?: number, smooth?: boolean): MouseChain {
  return new MouseChain(Promise.resolve()).move(x, y, duration, smooth);
}

export function moveBy(dx: number, dy: number, delay?: number): MouseChain {
  return new MouseChain(hw.mouse.move(dx, dy, delay));
}

export function hold(button: MouseBtn = "left", durationMs: number = 500): MouseChain {
  return down(button).wait(durationMs).up(button);
}

export function drag(
  fromX: number, fromY: number, toX: number, toY: number, button: MouseBtn = "left",
): MouseChain {
  return new MouseChain(Promise.resolve(), button).drag(fromX, fromY, toX, toY, button);
}

export function wheel(amount: number, delay?: number): MouseChain {
  return new MouseChain(hw.mouse.scrollWheel(amount, delay));
}

export function getPosition(): Position {
  return hw.mouse.getPos();
}

export function setPosition(pos: Position): MouseChain {
  return new MouseChain(hw.mouse.moveTo(pos.x, pos.y));
}

export function getState(button: MouseBtn): boolean {
  return isButtonPressed("mouse", button);
}

import { sleep } from "../utils";
import type { MouseBtn, Position } from "../types";

const nativeInput = require("../../native/input/input.node");

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
    this.promise = this.promise.then(() => nativeInput.mouseDown(b));
    return this;
  }

  up(button?: MouseBtn): MouseChain {
    const b = button ?? this.lastButton;
    this.promise = this.promise.then(() => nativeInput.mouseUp(b));
    return this;
  }

  click(button?: MouseBtn, delay?: number): MouseChain {
    const b = button ?? this.lastButton;
    this.promise = this.promise.then(() => nativeInput.mouseClick(b, delay));
    return this;
  }

  doubleClick(button?: MouseBtn, delay?: number): MouseChain {
    const b = button ?? this.lastButton;
    this.promise = this.promise.then(async () => {
      nativeInput.mouseClick(b, delay);
      nativeInput.mouseClick(b, delay);
    });
    return this;
  }

  move(x: number, y: number, duration?: number, smooth?: boolean): MouseChain {
    this.promise = this.promise.then(async () => {
      if (smooth && duration) {
        await smoothMoveTo(x, y, duration);
      } else if (duration) {
        await smoothMoveTo(x, y, duration);
      } else {
        nativeInput.mouseMoveTo(x, y);
      }
    });
    return this;
  }

  moveBy(dx: number, dy: number, delay?: number): MouseChain {
    this.promise = this.promise.then(async () => {
      nativeInput.mouseMoveBy(dx, dy);
      if (delay) await sleep(delay);
    });
    return this;
  }

  hold(button: MouseBtn | undefined, durationMs: number): MouseChain {
    const b = button ?? this.lastButton;
    return this.down(b).wait(durationMs).up(b);
  }

  wheel(amount: number, delay?: number): MouseChain {
    this.promise = this.promise.then(async () => {
      nativeInput.mouseWheel(amount);
      if (delay) await sleep(delay);
    });
    return this;
  }

  drag(fromX: number, fromY: number, toX: number, toY: number, button?: MouseBtn): MouseChain {
    const b = button ?? this.lastButton;
    this.promise = this.promise.then(async () => {
      nativeInput.mouseMoveTo(fromX, fromY);
      nativeInput.mouseDown(b);
      await sleep(35);
      await smoothMoveTo(toX, toY, 200);
      nativeInput.mouseUp(b);
    });
    return this;
  }

  setPosition(pos: Position): MouseChain {
    this.promise = this.promise.then(() => nativeInput.mouseMoveTo(pos.x, pos.y));
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
  return new MouseChain(Promise.resolve(nativeInput.mouseClick(button, delay)), button);
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
  return new MouseChain(Promise.resolve(nativeInput.mouseDown(button)), button);
}

export function up(button: MouseBtn = "left"): MouseChain {
  return new MouseChain(Promise.resolve(nativeInput.mouseUp(button)), button);
}

export function move(x: number, y: number, duration?: number, smooth?: boolean): MouseChain {
  return new MouseChain(Promise.resolve()).move(x, y, duration, smooth);
}

export function moveBy(dx: number, dy: number, delay?: number): MouseChain {
  return new MouseChain(Promise.resolve()).moveBy(dx, dy, delay);
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
  return new MouseChain(Promise.resolve()).wheel(amount, delay);
}

export function getPosition(): Position {
  const [x, y] = nativeInput.mousePosition() as [number, number];
  return { x, y };
}

export function setPosition(pos: Position): MouseChain {
  return new MouseChain(Promise.resolve(nativeInput.mouseMoveTo(pos.x, pos.y)));
}

export function getState(button: MouseBtn): boolean {
  return nativeInput.isMouseDown(button);
}

async function smoothMoveTo(x: number, y: number, duration: number) {
  const start = getPosition();
  const steps = Math.max(1, Math.round(duration / 10));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    nativeInput.mouseMoveTo(
      Math.round(start.x + (x - start.x) * t),
      Math.round(start.y + (y - start.y) * t),
    );
    await sleep(Math.max(1, Math.round(duration / steps)));
  }
}

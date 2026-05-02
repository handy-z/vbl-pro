import { sleep } from "../utils";
import type { MouseBtn, Position } from "../types";
import { nativeInput } from "../native";
import { Chain } from "../chain";

export class MouseChain extends Chain<MouseChain> {
  private lastButton: MouseBtn;

  constructor(initial: Promise<void>, button: MouseBtn = "left") {
    super(initial);
    this.lastButton = button;
  }

  down(button?: MouseBtn): MouseChain {
    const b = button ?? this.lastButton;
    this.lastButton = b;
    return this.append(() => nativeInput.mouseDown(b));
  }

  up(button?: MouseBtn): MouseChain {
    const b = button ?? this.lastButton;
    return this.append(() => nativeInput.mouseUp(b));
  }

  click(button?: MouseBtn, delay?: number): MouseChain {
    const b = button ?? this.lastButton;
    return this.append(() => nativeInput.mouseClick(b, delay));
  }

  doubleClick(button?: MouseBtn, delay?: number): MouseChain {
    const b = button ?? this.lastButton;
    return this.append(async () => {
      nativeInput.mouseClick(b, delay);
      nativeInput.mouseClick(b, delay);
    });
  }

  move(x: number, y: number, duration?: number, smooth?: boolean): MouseChain {
    return this.append(async () => {
      if (smooth && duration) {
        await smoothMoveTo(x, y, duration);
      } else if (duration) {
        await smoothMoveTo(x, y, duration);
      } else {
        nativeInput.mouseMoveTo(x, y);
      }
    });
  }

  moveBy(dx: number, dy: number, delay?: number): MouseChain {
    return this.append(async () => {
      nativeInput.mouseMoveBy(dx, dy);
      if (delay) await sleep(delay);
    });
  }

  hold(button: MouseBtn | undefined, durationMs: number): MouseChain {
    const b = button ?? this.lastButton;
    return this.down(b).wait(durationMs).up(b);
  }

  wheel(amount: number, delay?: number): MouseChain {
    return this.append(async () => {
      nativeInput.mouseWheel(amount);
      if (delay) await sleep(delay);
    });
  }

  drag(fromX: number, fromY: number, toX: number, toY: number, button?: MouseBtn): MouseChain {
    const b = button ?? this.lastButton;
    return this.append(async () => {
      nativeInput.mouseMoveTo(fromX, fromY);
      nativeInput.mouseDown(b);
      await sleep(35);
      await smoothMoveTo(toX, toY, 200);
      nativeInput.mouseUp(b);
    });
  }

  setPosition(pos: Position): MouseChain {
    return this.append(() => nativeInput.mouseMoveTo(pos.x, pos.y));
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

import * as action from "./action";
import * as listener from "./listener";
import type { MouseBtn, MouseEvent, MouseMoveEvent, MouseWheelEvent, Position } from "../types";

type AllBtnCallback = (event: MouseEvent) => void;
type FilteredBtnCallback = (event: MouseEvent) => void;
type MoveCallback = (event: MouseMoveEvent) => void;
type WheelCallback = (event: MouseWheelEvent) => void;

export interface Mouse {
  click(button?: MouseBtn, delay?: number): action.MouseChain;
  doubleClick(button?: MouseBtn, delay?: number): action.MouseChain;
  tripleClick(button?: MouseBtn, delay?: number): action.MouseChain;
  down(button?: MouseBtn): action.MouseChain;
  up(button?: MouseBtn): action.MouseChain;
  move(x: number, y: number, duration?: number, smooth?: boolean): action.MouseChain;
  moveBy(dx: number, dy: number, delay?: number): action.MouseChain;
  hold(button?: MouseBtn, durationMs?: number): action.MouseChain;
  drag(fromX: number, fromY: number, toX: number, toY: number, button?: MouseBtn): action.MouseChain;
  wheel(amount: number, delay?: number): action.MouseChain;
  get position(): Position;
  setPosition(pos: Position): action.MouseChain;
  getState(button: MouseBtn): boolean;
  waitClick(button?: MouseBtn, timeout?: number): Promise<MouseEvent>;
  on(event: "down", callback: AllBtnCallback): () => void;
  on(event: "down", button: MouseBtn, callback: FilteredBtnCallback): () => void;
  on(event: "up", callback: AllBtnCallback): () => void;
  on(event: "up", button: MouseBtn, callback: FilteredBtnCallback): () => void;
  on(event: "move", callback: MoveCallback): () => void;
  on(event: "wheel", callback: WheelCallback): () => void;
  once(event: "down", callback: AllBtnCallback): () => void;
  once(event: "down", button: MouseBtn, callback: FilteredBtnCallback): () => void;
  once(event: "up", callback: AllBtnCallback): () => void;
  once(event: "up", button: MouseBtn, callback: FilteredBtnCallback): () => void;
  once(event: "move", callback: MoveCallback): () => void;
  once(event: "wheel", callback: WheelCallback): () => void;
  off(event: "down"): void;
  off(event: "down", button: MouseBtn): void;
  off(event: "up"): void;
  off(event: "up", button: MouseBtn): void;
  off(event: "move"): void;
  off(event: "wheel"): void;
}

export const mouse: Mouse = {
  click: action.click,
  doubleClick: action.doubleClick,
  tripleClick: action.tripleClick,
  down: action.down,
  up: action.up,
  move: action.move,
  moveBy: action.moveBy,
  hold: action.hold,
  drag: action.drag,
  wheel: action.wheel,

  get position(): Position {
    return action.getPosition();
  },

  setPosition: action.setPosition,
  getState: action.getState,
  waitClick: listener.waitClick,
  on: listener.on as Mouse["on"],
  once: listener.once as Mouse["once"],
  off: listener.off as Mouse["off"],
};

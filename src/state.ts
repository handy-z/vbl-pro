import watcherConfig from "../game_watcher.json";

const STATE_KEYS = {
  GameOnGround: 0,
  GameSkillReady: 0,
  X1Held: 0,
  X2Held: 0,
  skillEnabled: 1,
  robloxFocused: 0,
} as const satisfies Record<string, number>;

export type StateKey = keyof typeof STATE_KEYS;

const allKeys = Object.keys(STATE_KEYS) as StateKey[];

const slots = Object.fromEntries(allKeys.map((key, i) => [key, i])) as Record<
  StateKey,
  number
>;

const defaults = STATE_KEYS;

const sab = new SharedArrayBuffer(allKeys.length * 4);

export class GameState {
  readonly view: Int32Array;
  readonly slots: Record<StateKey, number>;

  constructor(
    view: Int32Array,
    slotMap: Record<StateKey, number>,
    applyDefaults = false,
  ) {
    this.view = view;
    this.slots = slotMap;
    if (applyDefaults) {
      for (const key of allKeys) {
        Atomics.store(this.view, this.slots[key], defaults[key]);
      }
    }
  }

  get(key: StateKey): number {
    return Atomics.load(this.view, this.slots[key]);
  }

  set(key: StateKey, value: number): void {
    Atomics.store(this.view, this.slots[key], value);
  }

  is(key: StateKey): boolean {
    return this.get(key) !== 0;
  }

  toggle(key: StateKey): void {
    this.set(key, this.is(key) ? 0 : 1);
  }

  reset(): void {
    for (const key of allKeys) {
      this.set(key, defaults[key]);
    }
  }

  snapshot(): Record<StateKey, number> {
    return Object.fromEntries(
      allKeys.map((key) => [key, this.get(key)]),
    ) as Record<StateKey, number>;
  }

  keys(): readonly StateKey[] {
    return allKeys;
  }

  transferable(): { sab: SharedArrayBuffer; slots: Record<StateKey, number> } {
    return { sab: this.view.buffer as SharedArrayBuffer, slots: this.slots };
  }

  static from(data: {
    sab: SharedArrayBuffer;
    slots: Record<StateKey, number>;
  }): GameState {
    return new GameState(new Int32Array(data.sab), data.slots);
  }
}

export const gameState = new GameState(new Int32Array(sab), slots, true);
export { watcherConfig };

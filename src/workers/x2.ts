declare var self: Worker;

import { GameState } from "../state";

let state: GameState;
let actionResolve: (() => void) | null = null;

self.onmessage = (e: MessageEvent) => {
  if (e.data.type === "init") {
    state = GameState.from({
      sab: e.data.sab,
      slots: e.data.slots,
    });
    loop();
  } else if (e.data.type === "done") {
    actionResolve?.();
    actionResolve = null;
  }
};

async function loop() {
  while (true) {
    if (state.is("X2Held") && state.is("GameOnGround")) {
      await new Promise<void>((resolve) => {
        actionResolve = resolve;
        self.postMessage({ action: "combo" });
      });
    }

    await Bun.sleep(1);
  }
}

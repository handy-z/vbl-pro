import { keyboard, mouse } from "winput";
import { gameState } from "state";
import config from "config.json";

export function bindMouseEvents() {
  mouse.on("down", "x1", async () => {
    gameState.set("X1Held", 1);
    if (!gameState.is("X2Held") && gameState.is("GameOnGround")) {
      keyboard.tap("space").down("e");
    } else {
      if (
        gameState.is("skillEnabled") &&
        gameState.is("GameSkillReady") &&
        config.skill === "boomjump"
      )
        await Bun.sleep(100);
      else await Bun.sleep(25);
      keyboard.down("e");
    }
  });

  mouse.on("up", "x1", () => {
    gameState.set("X1Held", 0);
    keyboard.up("e");
  });

  mouse.on("down", "x2", () => {
    gameState.set("X2Held", 1);
  });

  mouse.on("up", "x2", async () => {
    gameState.set("X2Held", 0);
    if (gameState.is("X1Held")) return;
    if (
      gameState.is("skillEnabled") &&
      gameState.is("GameSkillReady") &&
      !gameState.is("GameOnGround")
    )
      switch (config.skill) {
        case "normal":
          keyboard.tap("ctrl");
          break;
        case "boomjump":
          await Bun.sleep(25);
          break;
      }
    mouse.click();
  });

  keyboard.on("down", "f1", () => {
    keyboard.tap("escape").tap("r").tap("enter");
  });

  keyboard.on("down", "f2", () => {
    gameState.toggle("skillEnabled");
    console.log(
      gameState.is("skillEnabled") ? "Skill Enabled" : "Skill Disabled",
    );
  });
}

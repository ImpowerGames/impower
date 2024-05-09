import type { Game } from "../../core/classes/Game";
import type { WorldModule } from "./classes/WorldModule";
import { DestroyCommandRunner } from "./classes/commands/destroyCommand/DestroyCommandRunner";
import { SpawnCommandRunner } from "./classes/commands/spawnCommand/SpawnCommandRunner";

export const worldCommands = (game: Game<{ world: WorldModule }>) => ({
  SpawnCommand: new SpawnCommandRunner(game),
  DestroyCommand: new DestroyCommandRunner(game),
});

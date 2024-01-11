import { SparkGame } from "../../game";
import { DestroyCommandRunner } from "../../project/classes/instances/items/commands/destroyCommand/DestroyCommandRunner";
import { DisplayCommandRunner } from "../../project/classes/instances/items/commands/displayCommand/DisplayCommandRunner";
import { SpawnCommandRunner } from "../../project/classes/instances/items/commands/spawnCommand/SpawnCommandRunner";
import { GameRunner } from "./GameRunner";

export class SparkGameRunner<G extends SparkGame> extends GameRunner<G> {
  constructor(game: G) {
    super(game, {
      SpawnCommand: new SpawnCommandRunner(game),
      DestroyCommand: new DestroyCommandRunner(game),
      DisplayCommand: new DisplayCommandRunner(game),
    });
  }
}

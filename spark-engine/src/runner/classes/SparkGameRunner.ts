import { SparkGame } from "../../game";
import { ChoiceCommandRunner } from "../../project/classes/instances/items/commands/dialog/choiceCommand/ChoiceCommandRunner";
import { DisplayCommandRunner } from "../../project/classes/instances/items/commands/dialog/displayCommand/DisplayCommandRunner";
import { DestroyCommandRunner } from "../../project/classes/instances/items/commands/entity/destroyCommand/DestroyCommandRunner";
import { SpawnCommandRunner } from "../../project/classes/instances/items/commands/entity/spawnCommand/SpawnCommandRunner";
import { GameRunner } from "./GameRunner";

export class SparkGameRunner<G extends SparkGame> extends GameRunner<G> {
  constructor() {
    super();
    this._commandRunners = {
      ...this._commandRunners,
      SpawnCommand: new SpawnCommandRunner(),
      DestroyCommand: new DestroyCommandRunner(),
      ChoiceCommand: new ChoiceCommandRunner(),
      DisplayCommand: new DisplayCommandRunner(),
    };
  }
}

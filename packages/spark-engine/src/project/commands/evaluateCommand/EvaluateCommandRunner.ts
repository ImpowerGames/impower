import { Game } from "../../../game/core/classes/Game";
import { CommandRunner } from "../../command/CommandRunner";
import { EvaluateCommandData } from "./EvaluateCommandData";

export class EvaluateCommandRunner<G extends Game> extends CommandRunner<
  G,
  EvaluateCommandData
> {
  override onExecute(data: EvaluateCommandData): number[] {
    const { expression } = data.params;

    if (!expression) {
      return super.onExecute(data);
    }

    this.game.logic.evaluate(expression);

    return super.onExecute(data);
  }
}

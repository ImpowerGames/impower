import type { Game } from "../../../../../core/classes/Game";
import { CommandRunner } from "../CommandRunner";
import { EvaluateCommandData } from "./EvaluateCommandData";

export class EvaluateCommandRunner<G extends Game> extends CommandRunner<
  G,
  EvaluateCommandData
> {
  override onExecute(data: EvaluateCommandData) {
    const { expression } = data.params;

    if (!expression) {
      return super.onExecute(data);
    }

    this.game.module.logic.evaluate(expression);

    return super.onExecute(data);
  }
}

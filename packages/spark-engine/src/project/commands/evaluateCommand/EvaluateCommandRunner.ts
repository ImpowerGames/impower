import { Game } from "../../../game/core/classes/Game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";
import { EvaluateCommandData } from "./EvaluateCommandData";

export class EvaluateCommandRunner<G extends Game> extends CommandRunner<
  G,
  EvaluateCommandData
> {
  override onExecute(
    data: EvaluateCommandData,
    context: CommandContext
  ): number[] {
    const { expression } = data.params;

    if (!expression) {
      return super.onExecute(data, context);
    }

    this.game.logic.evaluate(expression);

    return super.onExecute(data, context);
  }
}

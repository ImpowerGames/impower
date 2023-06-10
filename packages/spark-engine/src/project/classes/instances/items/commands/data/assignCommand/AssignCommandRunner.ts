import { evaluate } from "../../../../../../../../../spark-evaluate/src";
import { AssignCommandData } from "../../../../../../../data";
import { Game } from "../../../../../../../game";
import { modifyValue } from "../../../../../../../runner/utils/modifyValue";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class AssignCommandRunner<G extends Game> extends CommandRunner<
  G,
  AssignCommandData
> {
  override onExecute(
    game: G,
    data: AssignCommandData,
    context: CommandContext<G>
  ): number[] {
    const { variable, operator, value } = data;
    const { ids, valueMap } = context;

    const variableId = ids[variable];
    if (!variableId) {
      return super.onExecute(game, data, context);
    }

    const lhs = valueMap[variable];
    const rhs = evaluate(value, valueMap);
    const newValue = modifyValue(lhs, operator, rhs);

    game.logic.setVariableValue(variableId, newValue, data.from, data.line);

    return super.onExecute(game, data, context);
  }
}

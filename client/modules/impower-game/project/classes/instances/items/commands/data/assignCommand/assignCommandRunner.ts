import { evaluate } from "../../../../../../../../impower-evaluate";
import { AssignCommandData } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { modifyValue } from "../../../../../../../runner/utils/modifyValue";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";

export class AssignCommandRunner extends CommandRunner<AssignCommandData> {
  onExecute(
    data: AssignCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { variable, operator, value: expression } = data;
    const { ids, valueMap } = context;

    const variableId = ids[variable];
    if (!variableId) {
      return super.onExecute(data, context, game);
    }

    const lhs = valueMap[variable];
    const rhs = evaluate(expression, valueMap);
    const newValue = modifyValue(lhs, operator, rhs);

    game.logic.setVariableValue({
      pos: data.pos,
      line: data.line,
      id: variableId,
      value: newValue,
    });

    return super.onExecute(data, context, game);
  }

  isPure(): boolean {
    return false;
  }
}
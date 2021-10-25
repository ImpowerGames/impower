import {
  CommandData,
  SetCommandData,
  VariableData,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandRunner } from "../../../command/commandRunner";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";
import { changeValue } from "../../../../../../../runner/utils/changeValue";

export class SetCommandRunner extends CommandRunner<SetCommandData> {
  onExecute(
    data: SetCommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    const { variable, operator, value } = data;
    const { refId } = variable;
    if (!refId) {
      return super.onExecute(data, variables, game, index, blockCommands);
    }
    const lhs = getRuntimeValue(variable, variables, game);
    const rhs = getRuntimeValue(value, variables, game);
    const newValue = changeValue(lhs, operator, rhs);
    game.logic.setVariableValue({ id: refId, value: newValue });
    return super.onExecute(data, variables, game, index, blockCommands);
  }
}

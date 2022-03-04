import {
  CommandData,
  SetCommandData,
  VariableValue,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { changeValue } from "../../../../../../../runner/utils/changeValue";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";
import { CommandRunner } from "../../../command/commandRunner";

export class SetCommandRunner extends CommandRunner<SetCommandData> {
  onExecute(
    data: SetCommandData,
    variables: { [id: string]: VariableValue },
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
    game.logic.setVariableValue({
      pos: data.pos,
      line: data.line,
      id: refId,
      value: newValue,
    });
    return super.onExecute(data, variables, game, index, blockCommands);
  }

  isPure(
    _data: SetCommandData,
    _variables: { [id: string]: VariableValue },
    _game: ImpowerGame
  ): boolean {
    return false;
  }
}

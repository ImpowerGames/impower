import { CommandData, VariableData } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandRunner } from "../../../command/commandRunner";

export class ExitCommandRunner extends CommandRunner<CommandData> {
  onExecute(
    data: CommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    game.logic.exitBlock();
    return super.onExecute(data, variables, game, index, blockCommands);
  }
}

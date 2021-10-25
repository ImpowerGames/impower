import { CommandData, VariableData } from "../../../../../../../data";
import { CommandRunner } from "../../../command/commandRunner";
import { ImpowerGame } from "../../../../../../../game";

export class EndCommandRunner extends CommandRunner<CommandData> {
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
    game.end();
    return super.onExecute(data, variables, game, index, blockCommands);
  }
}

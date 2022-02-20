import { ImpowerGame } from "../../../../../../../game";
import { CommandData } from "../../../command/commandData";
import { CommandRunner } from "../../../command/commandRunner";
import { VariableData } from "../../../variable/variableData";
import { DisplayCommandData } from "./displayCommandData";

export class DisplayCommandRunner extends CommandRunner<DisplayCommandData> {
  down = false;

  onExecute(
    data: DisplayCommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    this.down = game.input.state.pointer.down.includes(0);
    return super.onExecute(data, variables, game, index, blockCommands);
  }

  isFinished(
    data: DisplayCommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): boolean {
    const prevDown = this.down;
    this.down = game.input.state.pointer.down.includes(0);
    if (!prevDown && this.down) {
      return true;
    }
    return false;
  }
}

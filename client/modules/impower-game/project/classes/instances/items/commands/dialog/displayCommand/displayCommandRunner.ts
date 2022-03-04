import { ImpowerGame } from "../../../../../../../game";
import { CommandData } from "../../../command/commandData";
import { CommandRunner } from "../../../command/commandRunner";
import { VariableValue } from "../../../variable/variableValue";
import { DisplayCommandData } from "./displayCommandData";
import { executeDisplayCommand } from "./executeDisplayCommand";

export class DisplayCommandRunner extends CommandRunner<DisplayCommandData> {
  down = false;

  onExecute(
    data: DisplayCommandData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    this.down = game.input.state.pointer.down.includes(0);
    executeDisplayCommand(data);
    return super.onExecute(data, variables, game, index, blockCommands);
  }

  isFinished(
    data: DisplayCommandData,
    variables: { [id: string]: VariableValue },
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

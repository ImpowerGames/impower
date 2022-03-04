import { CommandData, VariableValue } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { getNextJumpIndex } from "../../../../../../../runner/utils/getNextJumpIndex";
import { CommandRunner } from "../../../command/commandRunner";

export class ElseCommandRunner extends CommandRunner<CommandData> {
  closesGroup(): boolean {
    return true;
  }

  opensGroup(): boolean {
    return true;
  }

  onExecute(
    _data: CommandData,
    _variables: { [id: string]: VariableValue },
    _game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    // Skip to the command after the next "Close" command
    const nextCommandIndex = getNextJumpIndex(
      [{ refTypeId: "CloseCommand", indexOffset: 1 }],
      index,
      blockCommands
    );
    return [nextCommandIndex];
  }
}

import {
  CommandData,
  VariableData,
  CommandTypeId,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandRunner } from "../../../command/commandRunner";
import { getNextJumpIndex } from "../../../../../../../runner/utils/getNextJumpIndex";

export class ElseCommandRunner extends CommandRunner<CommandData> {
  closesGroup(): boolean {
    return true;
  }

  opensGroup(): boolean {
    return true;
  }

  onExecute(
    _data: CommandData,
    _variables: { [refId: string]: VariableData },
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
      [{ refTypeId: CommandTypeId.CloseCommand, indexOffset: 1 }],
      index,
      blockCommands
    );
    return [nextCommandIndex];
  }
}

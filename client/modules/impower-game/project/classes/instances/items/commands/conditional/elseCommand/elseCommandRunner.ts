import { CommandData } from "../../../../../../../data";
import { getNextJumpIndex } from "../../../../../../../runner/utils/getNextJumpIndex";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";

export class ElseCommandRunner extends CommandRunner<CommandData> {
  closesGroup(): boolean {
    return true;
  }

  opensGroup(): boolean {
    return true;
  }

  onExecute(_data: CommandData, context: CommandContext): number[] {
    const { index, commands } = context;
    // Skip to the command after the next "Close" command
    const nextCommandIndex = getNextJumpIndex(
      [{ refTypeId: "CloseCommand", indexOffset: 1 }],
      index,
      commands
    );
    return [nextCommandIndex];
  }
}

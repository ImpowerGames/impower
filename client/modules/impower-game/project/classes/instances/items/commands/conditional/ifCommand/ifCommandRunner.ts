import { evaluate } from "../../../../../../../../impower-evaluate";
import { IfCommandData, InstanceData } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { getNextJumpIndex } from "../../../../../../../runner/utils/getNextJumpIndex";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";

export class IfCommandRunner extends CommandRunner<IfCommandData> {
  closesGroup(data: IfCommandData, group?: InstanceData): boolean {
    if (group && group.reference.refTypeId === "SelectCommand") {
      // Don't allow nesting If commands inside Select commands
      return true;
    }
    return super.closesGroup(data, group);
  }

  opensGroup(): boolean {
    return true;
  }

  onExecute(
    data: IfCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { value } = data;
    const { valueMap, index, commands } = context;
    const shouldExecute = evaluate(value, valueMap);
    if (!shouldExecute) {
      // Skip to the next "ElseIf" command or
      // skip to the command after the next "Else" or "Close" command
      const nextCommandIndex = getNextJumpIndex(
        [
          { refTypeId: "ElseIfCommand", indexOffset: 0 },
          { refTypeId: "ElseCommand", indexOffset: 1 },
          { refTypeId: "CloseCommand", indexOffset: 1 },
        ],
        index,
        commands
      );
      return [nextCommandIndex];
    }
    return super.onExecute(data, context, game);
  }
}

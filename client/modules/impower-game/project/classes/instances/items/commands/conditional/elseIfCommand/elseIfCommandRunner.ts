import { evaluate } from "../../../../../../../../impower-evaluate";
import { IfCommandData } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game/classes/impowerGame";
import { getNextJumpIndex } from "../../../../../../../runner/utils/getNextJumpIndex";
import { CommandContext } from "../../../command/commandRunner";
import { IfCommandRunner } from "../ifCommand/ifCommandRunner";

export class ElseIfCommandRunner extends IfCommandRunner {
  closesGroup(): boolean {
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

    const blockState =
      game.logic.state.blockStates[data.reference.parentContainerId];
    const previousCommandTypeId =
      commands[blockState.previousIndex].data.reference.refTypeId;
    if (
      previousCommandTypeId === "IfCommand" ||
      previousCommandTypeId === "ElseIfCommand"
    ) {
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
    } else {
      // Skip to the command after the next "Close" command
      const nextCommandIndex = getNextJumpIndex(
        [{ refTypeId: "CloseCommand", indexOffset: 1 }],
        index,
        commands
      );
      return [nextCommandIndex];
    }
    return super.onExecute(data, context, game);
  }
}

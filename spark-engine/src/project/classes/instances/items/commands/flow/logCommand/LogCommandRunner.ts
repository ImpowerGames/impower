import { uuid } from "../../../../../../../../../spark-evaluate";
import { LogCommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class LogCommandRunner extends CommandRunner<LogCommandData> {
  onExecute(
    data: LogCommandData,
    context: CommandContext,
    game: SparkGame
  ): number[] {
    const { severity, message } = data;
    if (severity === undefined) {
      return super.onExecute(data, context, game);
    }
    if (message === undefined) {
      return super.onExecute(data, context, game);
    }
    const { parentContainerId, refId } = data.reference;
    const parentNode = game.logic.blockMap[parentContainerId];
    const parentParentContainerId = parentNode?.parent;
    game.debug.log({
      id: uuid(),
      parentBlockId: parentParentContainerId,
      blockId: parentContainerId,
      commandId: refId,
      time: new Date().getTime(),
      severity,
      message,
    });
    return super.onExecute(data, context, game);
  }
}

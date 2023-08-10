import { uuid } from "../../../../../../../../../spark-evaluate/src";
import { LogCommandData } from "../../../../../../../data";
import { Game } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class LogCommandRunner<G extends Game> extends CommandRunner<
  G,
  LogCommandData
> {
  override onExecute(
    game: G,
    data: LogCommandData,
    context: CommandContext<G>
  ): number[] {
    const { severity, message } = data.params;
    if (severity === undefined) {
      return super.onExecute(game, data, context);
    }
    if (message === undefined) {
      return super.onExecute(game, data, context);
    }
    const { parentId: parentContainerId, id: refId } = data.reference;
    const parentNode = game.logic.config.blockMap[parentContainerId];
    const parentParentContainerId = parentNode?.parent;
    game.debug.log({
      id: uuid(),
      parentBlockId: parentParentContainerId || "",
      blockId: parentContainerId,
      commandId: refId,
      time: new Date().getTime(),
      severity,
      message,
    });
    return super.onExecute(game, data, context);
  }
}

import { getUuid } from "../../../../../../../../impower-core";
import { LogCommandData, Severity } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";

export class LogCommandRunner extends CommandRunner<LogCommandData> {
  onExecute(
    data: LogCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { severity, message } = data;
    if (severity === undefined) {
      return super.onExecute(data, context, game);
    }
    if (message === undefined) {
      return super.onExecute(data, context, game);
    }
    const { parentContainerId, refId } = data.reference;
    const parentNode = game.logic.blockTree[parentContainerId];
    const parentParentContainerId = parentNode?.parent;
    game.debug.log({
      id: getUuid(),
      parentBlockId: parentParentContainerId,
      blockId: parentContainerId,
      commandId: refId,
      time: new Date().getTime(),
      severity,
      message,
    });
    console.log(`${Severity[severity].toUpperCase()}: ${message}`); // eslint-disable-line no-console
    return super.onExecute(data, context, game);
  }
}

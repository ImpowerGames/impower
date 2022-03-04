import { getUuid } from "../../../../../../../../impower-core";
import {
  CommandData,
  LogCommandData,
  Severity,
  VariableValue,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";
import { CommandRunner } from "../../../command/commandRunner";

export class LogCommandRunner extends CommandRunner<LogCommandData> {
  onExecute(
    data: LogCommandData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    const { severity } = data;
    const message = getRuntimeValue(data.message, variables, game);
    if (severity === undefined) {
      return super.onExecute(data, variables, game, index, blockCommands);
    }
    if (message === undefined) {
      return super.onExecute(data, variables, game, index, blockCommands);
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
    return super.onExecute(data, variables, game, index, blockCommands);
  }
}

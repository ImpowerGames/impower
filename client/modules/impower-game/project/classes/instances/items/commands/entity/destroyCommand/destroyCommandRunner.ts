import {
  CommandData,
  DestroyCommandData,
  VariableValue,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";
import { CommandRunner } from "../../../command/commandRunner";

export class DestroyCommandRunner extends CommandRunner<DestroyCommandData> {
  onExecute(
    data: DestroyCommandData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    const constructReference = getRuntimeValue(data.construct, variables, game);
    if (!constructReference || !constructReference.refId) {
      return super.onExecute(data, variables, game, index, blockCommands);
    }
    const { refId } = constructReference;
    game.entity.unloadConstruct({ id: refId });
    return super.onExecute(data, variables, game, index, blockCommands);
  }
}

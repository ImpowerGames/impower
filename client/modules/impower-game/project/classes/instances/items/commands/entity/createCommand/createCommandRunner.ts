import {
  CommandData,
  CreateCommandData,
  VariableData,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";
import { CommandRunner } from "../../../command/commandRunner";

export class CreateCommandRunner extends CommandRunner<CreateCommandData> {
  onExecute(
    data: CreateCommandData,
    variables: { [refId: string]: VariableData },
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
    game.entity.loadConstruct({ id: refId });
    return super.onExecute(data, variables, game, index, blockCommands);
  }
}

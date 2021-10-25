import { VariableData, CommandData } from "../../../../../../../data";
import { LoadableFile } from "../../../../../../../data/interfaces/loadableFile";
import { ImpowerGame } from "../../../../../../../game";
import { getRuntimeValue } from "../../../../../../../runner";
import { CommandRunner } from "../../../command/commandRunner";
import { ShowPortraitCommandData } from "./showPortraitCommandData";

export class ShowPortraitCommandRunner
  extends CommandRunner<ShowPortraitCommandData>
  implements LoadableFile<ShowPortraitCommandData>
{
  getFileId(
    data: ShowPortraitCommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): string {
    return getRuntimeValue(data.image, variables, game).refId;
  }

  onExecute(
    data: ShowPortraitCommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    const constructReference = getRuntimeValue(data.stage, variables, game);
    if (!constructReference || !constructReference.refId) {
      return super.onExecute(data, variables, game, index, blockCommands);
    }
    const imageReference = getRuntimeValue(data.image, variables, game);
    const elementReference = getRuntimeValue(data.position, variables, game);

    const { refId: constructRefId } = constructReference;
    const { refId: imageRefId } = imageReference;
    const { refId: elementRefId } = elementReference;

    game.entity.setElementImage({
      imageRefId,
      constructRefId,
      elementRefId,
    });

    return super.onExecute(data, variables, game, index, blockCommands);
  }
}

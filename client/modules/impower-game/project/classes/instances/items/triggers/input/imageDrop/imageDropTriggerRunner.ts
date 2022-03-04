import { LoadableFile } from "../../../../../../../data/interfaces/loadableFile";
import { ImpowerGame } from "../../../../../../../game";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";
import { TriggerRunner } from "../../../trigger/triggerRunner";
import { VariableValue } from "../../../variable/variableValue";
import { ImageDropTriggerData } from "./imageDropTriggerData";

export class ImageDropTriggerRunner
  extends TriggerRunner<ImageDropTriggerData>
  implements LoadableFile<ImageDropTriggerData>
{
  getFileId(
    data: ImageDropTriggerData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame
  ): string {
    return getRuntimeValue(data.image, variables, game).refId;
  }

  init(
    data: ImageDropTriggerData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame
  ): void {
    function onImageDrop(gameData: { id: string }): void {
      const { id } = gameData;
      if (id === getRuntimeValue(data.image, variables, game).refId) {
        game.logic.setTriggerValue({
          pos: data.pos,
          line: data.line,
          id: data.reference.parentContainerId,
          value: id,
        });
      }
    }

    game.asset.events.onDropImage.addListener(onImageDrop);
    game.asset.markImageAsDropTrigger({
      id: getRuntimeValue(data.image, variables, game).refId,
    });
  }

  shouldExecute(
    data: ImageDropTriggerData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame
  ): boolean {
    const { parentContainerId } = data.reference;
    const triggerState = game.logic.state.triggerStates[parentContainerId];

    if (triggerState !== undefined && triggerState.value !== null) {
      if (!data.repeatable && triggerState.executionCount > 1) {
        return false;
      }
      game.logic.setTriggerValue({
        pos: data.pos,
        line: data.line,
        id: parentContainerId,
        value: null,
      });

      return true;
    }

    return super.shouldExecute(data, variables, game);
  }
}

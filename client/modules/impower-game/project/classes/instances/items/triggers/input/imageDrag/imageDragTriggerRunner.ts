import { LoadableFile } from "../../../../../../../data/interfaces/loadableFile";
import { ImpowerGame } from "../../../../../../../game";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";
import { TriggerRunner } from "../../../trigger/triggerRunner";
import { VariableData } from "../../../variable/variableData";
import { ImageDragTriggerData } from "./imageDragTriggerData";

export class ImageDragTriggerRunner
  extends TriggerRunner<ImageDragTriggerData>
  implements LoadableFile<ImageDragTriggerData>
{
  getFileId(
    data: ImageDragTriggerData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): string {
    return getRuntimeValue(data.image, variables, game).refId;
  }

  initialize(
    data: ImageDragTriggerData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): void {
    function onImageDrag(gameData: { id: string }): void {
      const { id } = gameData;
      if (id === getRuntimeValue(data.image, variables, game).refId) {
        game.logic.setTriggerValue({
          id: data.reference.parentContainerId,
          value: id,
        });
      }
    }

    game.asset.events.onDragImage.addListener(onImageDrag);
    game.asset.markImageAsDragTrigger({
      id: getRuntimeValue(data.image, variables, game).refId,
    });
  }

  shouldExecute(
    data: ImageDragTriggerData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): boolean {
    const { parentContainerId } = data.reference;
    const triggerState = game.logic.state.triggerStates[parentContainerId];

    if (triggerState !== undefined && triggerState.value !== null) {
      if (!data.repeatable && triggerState.executionCount > 1) {
        return false;
      }
      game.logic.setTriggerValue({ id: parentContainerId, value: null });

      return true;
    }

    return super.shouldExecute(data, variables, game);
  }
}

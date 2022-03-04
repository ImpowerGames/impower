import { LoadableFile } from "../../../../../../../data/interfaces/loadableFile";
import { ImpowerGame } from "../../../../../../../game";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";
import { TriggerRunner } from "../../../trigger/triggerRunner";
import { VariableValue } from "../../../variable/variableValue";
import { ImageDragTriggerData } from "./imageDragTriggerData";

export class ImageDragTriggerRunner
  extends TriggerRunner<ImageDragTriggerData>
  implements LoadableFile<ImageDragTriggerData>
{
  getFileId(
    data: ImageDragTriggerData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame
  ): string {
    return getRuntimeValue(data.image, variables, game).refId;
  }

  init(
    data: ImageDragTriggerData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame
  ): void {
    function onImageDrag(gameData: { id: string }): void {
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

    game.asset.events.onDragImage.addListener(onImageDrag);
    game.asset.markImageAsDragTrigger({
      id: getRuntimeValue(data.image, variables, game).refId,
    });
  }

  shouldExecute(
    data: ImageDragTriggerData,
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

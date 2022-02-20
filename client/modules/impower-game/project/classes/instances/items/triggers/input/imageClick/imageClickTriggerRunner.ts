import { InputCondition } from "../../../../../../../data";
import { LoadableFile } from "../../../../../../../data/interfaces/loadableFile";
import { ImpowerGame } from "../../../../../../../game";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";
import { TriggerRunner } from "../../../trigger/triggerRunner";
import { VariableData } from "../../../variable/variableData";
import { ImageClickTriggerData } from "./imageClickTriggerData";

export class ImageClickTriggerRunner
  extends TriggerRunner<ImageClickTriggerData>
  implements LoadableFile<ImageClickTriggerData>
{
  getFileId(
    data: ImageClickTriggerData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): string {
    return getRuntimeValue(data.image, variables, game).refId;
  }

  init(
    data: ImageClickTriggerData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): void {
    function onImageClick(gameData: { id: string }): void {
      const { id } = gameData;
      if (id === getRuntimeValue(data.image, variables, game).refId) {
        game.logic.setTriggerValue({
          id: data.reference.parentContainerId,
          value: id,
        });
      }
    }

    function resetHeldEvent(): void {
      game.logic.setTriggerValue({
        id: data.reference.parentContainerId,
        value: null,
      });
    }

    switch (data.action) {
      case InputCondition.Started:
        game.asset.events.onClickDownImage.addListener(onImageClick);
        break;
      case InputCondition.Stopped:
        game.asset.events.onClickUpImage.addListener(onImageClick);
        break;
      case InputCondition.Is:
        game.asset.events.onClickDownImage.addListener(onImageClick);
        game.asset.events.onClickUpImage.addListener(resetHeldEvent);
        game.input.events.onEmptyPhaserClickUp.addListener(resetHeldEvent);
        break;
      default:
        break;
    }

    game.asset.markImageAsClickTrigger({
      id: getRuntimeValue(data.image, variables, game).refId,
    });
  }

  shouldExecute(
    data: ImageClickTriggerData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): boolean {
    const { parentContainerId } = data.reference;
    const triggerState = game.logic.state.triggerStates[parentContainerId];

    if (triggerState !== undefined && triggerState.value !== null) {
      if (!data.repeatable && triggerState.executionCount > 1) {
        return false;
      }

      if (data.action !== InputCondition.Is) {
        // Reset the trigger.  Held actions are reset on a separate event.
        game.logic.setTriggerValue({ id: parentContainerId, value: null });
      }

      return true;
    }

    return super.shouldExecute(data, variables, game);
  }
}

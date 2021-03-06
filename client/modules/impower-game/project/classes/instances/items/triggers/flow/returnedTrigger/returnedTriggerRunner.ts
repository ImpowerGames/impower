import {
  TriggerData,
  VariableData,
  TriggerTypeId,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { TriggerRunner } from "../../../trigger/triggerRunner";

export class ReturnedTriggerRunner extends TriggerRunner<
  TriggerData<TriggerTypeId.ReturnedTrigger>
> {
  shouldExecute(
    data: TriggerData<TriggerTypeId.ReturnedTrigger>,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): boolean {
    const { parentContainerId } = data.reference;
    const parentParentContainerId =
      game.logic.blockTree[parentContainerId]?.parent;
    const blockState = game.logic.state.blockStates[parentParentContainerId];
    // This trigger should only be satisied when returning to the parent block from a child
    // It should not execute when the parent block has been entered from its parent
    if (blockState && blockState.hasReturned) {
      return true;
    }
    return super.shouldExecute(data, variables, game);
  }
}

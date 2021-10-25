import {
  TriggerData,
  VariableData,
  TriggerTypeId,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { TriggerRunner } from "../../../trigger/triggerRunner";

export class EnteredTriggerRunner extends TriggerRunner<
  TriggerData<TriggerTypeId.EnteredTrigger>
> {
  shouldExecute(
    data: TriggerData<TriggerTypeId.EnteredTrigger>,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): boolean {
    const { parentContainerId } = data.reference;
    const parentParentContainerId =
      game.logic.blockTree[parentContainerId]?.parent;
    const blockState = game.logic.state.blockStates[parentParentContainerId];
    // This trigger should only be satisied when entering the parent block
    // It should not execute when the block is returning from having entered the parent from a child block
    if (!blockState || !blockState.hasReturned) {
      return true;
    }
    return super.shouldExecute(data, variables, game);
  }
}

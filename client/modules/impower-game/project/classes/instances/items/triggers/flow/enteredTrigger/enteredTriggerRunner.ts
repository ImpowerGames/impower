import { TriggerData, VariableValue } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { TriggerRunner } from "../../../trigger/triggerRunner";

export class EnteredTriggerRunner extends TriggerRunner<
  TriggerData<"EnteredTrigger">
> {
  shouldExecute(
    data: TriggerData<"EnteredTrigger">,
    variables: { [id: string]: VariableValue },
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

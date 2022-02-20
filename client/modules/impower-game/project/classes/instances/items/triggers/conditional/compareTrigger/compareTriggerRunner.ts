import { VariableData } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { isConditionSatisfied } from "../../../../../../../runner/utils/isConditionSatisfied";
import { TriggerRunner } from "../../../trigger/triggerRunner";
import { CompareTriggerData } from "./compareTriggerData";

export class CompareTriggerRunner extends TriggerRunner<CompareTriggerData> {
  shouldExecute(
    data: CompareTriggerData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): boolean {
    if (isConditionSatisfied(data, variables, game)) {
      return true;
    }
    return super.shouldExecute(data, variables, game);
  }
}

import { TriggerData, TriggerTypeId } from "../../../../../../../data";
import { TriggerRunner } from "../../../trigger/triggerRunner";

export class AllTriggerRunner extends TriggerRunner<
  TriggerData<TriggerTypeId.AllTrigger>
> {
  opensGroup(): boolean {
    return true;
  }

  shouldCheckAllChildren(
    _data: TriggerData<TriggerTypeId.AllTrigger>
  ): boolean {
    return true;
  }
}

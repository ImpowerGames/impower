import { TriggerData, TriggerTypeId } from "../../../../../../../data";
import { TriggerRunner } from "../../../trigger/triggerRunner";

export class CloseTriggerRunner extends TriggerRunner<
  TriggerData<TriggerTypeId.CloseTrigger>
> {
  closesGroup(): boolean {
    return true;
  }
}

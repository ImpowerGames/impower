import { TriggerData, TriggerTypeId } from "../../../../../../../data";
import { TriggerRunner } from "../../../trigger/triggerRunner";

export class AnyTriggerRunner extends TriggerRunner<
  TriggerData<TriggerTypeId.AnyTrigger>
> {
  opensGroup(): boolean {
    return true;
  }
}

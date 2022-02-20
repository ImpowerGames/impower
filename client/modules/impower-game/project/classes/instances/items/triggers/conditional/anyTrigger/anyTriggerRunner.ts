import { TriggerData } from "../../../../../../../data";
import { TriggerRunner } from "../../../trigger/triggerRunner";

export class AnyTriggerRunner extends TriggerRunner<TriggerData<"AnyTrigger">> {
  opensGroup(): boolean {
    return true;
  }
}

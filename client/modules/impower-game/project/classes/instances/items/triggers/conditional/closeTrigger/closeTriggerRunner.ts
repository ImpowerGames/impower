import { TriggerData } from "../../../../../../../data";
import { TriggerRunner } from "../../../trigger/triggerRunner";

export class CloseTriggerRunner extends TriggerRunner<
  TriggerData<"CloseTrigger">
> {
  closesGroup(): boolean {
    return true;
  }
}

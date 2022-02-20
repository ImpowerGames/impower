import { TriggerData } from "../../../../../../../data";
import { TriggerRunner } from "../../../trigger/triggerRunner";

export class AllTriggerRunner extends TriggerRunner<TriggerData<"AllTrigger">> {
  opensGroup(): boolean {
    return true;
  }

  shouldCheckAllChildren(_data: TriggerData<"AllTrigger">): boolean {
    return true;
  }
}

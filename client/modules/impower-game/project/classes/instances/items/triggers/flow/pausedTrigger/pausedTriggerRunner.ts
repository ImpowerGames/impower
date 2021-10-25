import { TriggerData, TriggerTypeId } from "../../../../../../../data";
import { TriggerRunner } from "../../../trigger/triggerRunner";

export class PausedTriggerRunner extends TriggerRunner<
  TriggerData<TriggerTypeId.PausedTrigger>
> {}

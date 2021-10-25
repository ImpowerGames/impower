import { InputCondition } from "../../../../../../../data/enums/inputCondition";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { ImageFileReference } from "../../../../../../../data/interfaces/references/imageFileReference";
import { TriggerData } from "../../../trigger/triggerData";
import { TriggerTypeId } from "../../../trigger/triggerTypeId";

export interface ImageClickTriggerData
  extends TriggerData<TriggerTypeId.ImageClickTrigger> {
  image: DynamicData<ImageFileReference>;
  action: InputCondition;
}

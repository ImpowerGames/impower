import { InputCondition } from "../../../../../../../data/enums/inputCondition";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { ImageFileReference } from "../../../../../../../data/interfaces/references/imageFileReference";
import { TriggerData } from "../../../trigger/triggerData";

export interface ImageClickTriggerData
  extends TriggerData<"ImageClickTrigger"> {
  image: DynamicData<ImageFileReference>;
  action: InputCondition;
}

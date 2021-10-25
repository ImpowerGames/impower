import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { ImageFileReference } from "../../../../../../../data/interfaces/references/imageFileReference";
import { TriggerData } from "../../../trigger/triggerData";
import { TriggerTypeId } from "../../../trigger/triggerTypeId";

export interface ImageHoverTriggerData
  extends TriggerData<TriggerTypeId.ImageHoverTrigger> {
  image: DynamicData<ImageFileReference>;
}

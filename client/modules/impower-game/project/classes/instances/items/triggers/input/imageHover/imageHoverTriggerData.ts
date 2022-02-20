import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { ImageFileReference } from "../../../../../../../data/interfaces/references/imageFileReference";
import { TriggerData } from "../../../trigger/triggerData";

export interface ImageHoverTriggerData
  extends TriggerData<"ImageHoverTrigger"> {
  image: DynamicData<ImageFileReference>;
}

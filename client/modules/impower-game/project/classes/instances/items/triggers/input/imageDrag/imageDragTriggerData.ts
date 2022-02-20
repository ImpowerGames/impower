import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { ImageFileReference } from "../../../../../../../data/interfaces/references/imageFileReference";
import { TriggerData } from "../../../trigger/triggerData";

export interface ImageDragTriggerData extends TriggerData<"ImageDragTrigger"> {
  image: DynamicData<ImageFileReference>;
}

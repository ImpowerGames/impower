import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { ImageFileReference } from "../../../../../../../data/interfaces/references/imageFileReference";
import { TriggerData } from "../../../trigger/triggerData";

export interface ImageDropTriggerData extends TriggerData<"ImageDropTrigger"> {
  image: DynamicData<ImageFileReference>;
}

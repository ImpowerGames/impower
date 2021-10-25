import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { ImageFileReference } from "../../../../../../../data/interfaces/references/imageFileReference";
import { TriggerData } from "../../../trigger/triggerData";
import { TriggerTypeId } from "../../../trigger/triggerTypeId";

export interface ImageDropTriggerData
  extends TriggerData<TriggerTypeId.ImageDropTrigger> {
  image: DynamicData<ImageFileReference>;
}

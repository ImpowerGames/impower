import { ImageFileReference } from "../../../../../../../data";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";

export interface HideImageCommandData extends CommandData<"HideImageCommand"> {
  image: DynamicData<ImageFileReference>;
  transition: TransitionConfig;
}

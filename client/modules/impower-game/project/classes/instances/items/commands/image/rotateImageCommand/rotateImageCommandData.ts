import { ImageFileReference } from "../../../../../../../data";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";

export interface RotateToImageCommandData
  extends CommandData<"RotateToImageCommand"> {
  image: DynamicData<ImageFileReference>;
  transition: TransitionConfig;
  angle: DynamicData<number>;
  additive: DynamicData<boolean>;
}

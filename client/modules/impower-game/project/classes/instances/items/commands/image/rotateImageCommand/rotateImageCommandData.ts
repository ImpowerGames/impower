import { CommandTypeId, ImageFileReference } from "../../../../../../../data";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";

export interface RotateToImageCommandData
  extends CommandData<CommandTypeId.RotateToImageCommand> {
  image: DynamicData<ImageFileReference>;
  transition: TransitionConfig;
  angle: DynamicData<number>;
  additive: DynamicData<boolean>;
}

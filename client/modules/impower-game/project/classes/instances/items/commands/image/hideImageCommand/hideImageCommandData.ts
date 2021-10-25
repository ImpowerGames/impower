import { CommandTypeId, ImageFileReference } from "../../../../../../../data";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";
import { CommandData } from "../../../command/commandData";

export interface HideImageCommandData
  extends CommandData<CommandTypeId.HideImageCommand> {
  image: DynamicData<ImageFileReference>;
  transition: TransitionConfig;
}

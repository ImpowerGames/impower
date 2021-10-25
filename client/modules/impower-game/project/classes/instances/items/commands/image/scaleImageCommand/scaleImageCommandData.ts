import { CommandTypeId, ImageFileReference } from "../../../../../../../data";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";
import { Vector2Config } from "../../../../../../../data/interfaces/configs/vectorConfig";

export interface ScaleToImageCommandData
  extends CommandData<CommandTypeId.ScaleToImageCommand> {
  image: DynamicData<ImageFileReference>;
  transition: TransitionConfig;
  scale: Vector2Config;
  additive: DynamicData<boolean>;
}

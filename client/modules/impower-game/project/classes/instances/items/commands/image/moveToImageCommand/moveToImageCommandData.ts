import { CommandTypeId, ImageFileReference } from "../../../../../../../data";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";
import { Vector2Config } from "../../../../../../../data/interfaces/configs/vectorConfig";

export interface MoveToImageCommandData
  extends CommandData<CommandTypeId.MoveToImageCommand> {
  image: DynamicData<ImageFileReference>;
  position: Vector2Config;
  transition: TransitionConfig;
  additive: DynamicData<boolean>;
}

import { ImageFileReference } from "../../../../../../../data";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";
import { Vector2Config } from "../../../../../../../data/interfaces/configs/vectorConfig";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";

export interface MoveToImageCommandData
  extends CommandData<"MoveToImageCommand"> {
  image: DynamicData<ImageFileReference>;
  position: Vector2Config;
  transition: TransitionConfig;
  additive: DynamicData<boolean>;
}

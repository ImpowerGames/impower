import { ImageFileReference } from "../../../../../../../data";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";
import { Vector2Config } from "../../../../../../../data/interfaces/configs/vectorConfig";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";

export interface ScaleToImageCommandData
  extends CommandData<"ScaleToImageCommand"> {
  image: DynamicData<ImageFileReference>;
  transition: TransitionConfig;
  scale: Vector2Config;
  additive: DynamicData<boolean>;
}

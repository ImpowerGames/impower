import { Optional } from "../../../../../../../../impower-core/types/interfaces/optional";
import { ImageFileReference } from "../../../../../../../data";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";
import { Vector2Config } from "../../../../../../../data/interfaces/configs/vectorConfig";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";

export interface ShowImageCommandData extends CommandData<"ShowImageCommand"> {
  image: DynamicData<ImageFileReference>;
  position: Vector2Config;
  size: Optional<Vector2Config>;
  transition: TransitionConfig;
}

import { CommandTypeId, ImageFileReference } from "../../../../../../../data";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";
import { Optional } from "../../../../../../../../impower-core/types/interfaces/optional";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";
import { Vector2Config } from "../../../../../../../data/interfaces/configs/vectorConfig";

export interface ShowImageCommandData
  extends CommandData<CommandTypeId.ShowImageCommand> {
  image: DynamicData<ImageFileReference>;
  position: Vector2Config;
  size: Optional<Vector2Config>;
  transition: TransitionConfig;
}

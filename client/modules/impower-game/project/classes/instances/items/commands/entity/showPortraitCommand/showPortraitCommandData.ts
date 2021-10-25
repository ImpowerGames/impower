import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";
import { ConstructReference } from "../../../../../../../data/interfaces/references/constructReference";
import { CommandTypeId } from "../../../command/commandTypeId";
import {
  ElementReference,
  ImageFileReference,
} from "../../../../../../../data";

export interface ShowPortraitCommandData
  extends CommandData<CommandTypeId.ShowPortraitCommand> {
  stage: DynamicData<ConstructReference>;
  position: DynamicData<ElementReference>;
  image: DynamicData<ImageFileReference>;
}

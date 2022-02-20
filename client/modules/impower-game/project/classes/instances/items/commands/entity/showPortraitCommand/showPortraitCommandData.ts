import {
  ElementReference,
  ImageFileReference,
} from "../../../../../../../data";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { ConstructReference } from "../../../../../../../data/interfaces/references/constructReference";
import { CommandData } from "../../../command/commandData";

export interface ShowPortraitCommandData
  extends CommandData<"ShowPortraitCommand"> {
  stage: DynamicData<ConstructReference>;
  position: DynamicData<ElementReference>;
  image: DynamicData<ImageFileReference>;
}

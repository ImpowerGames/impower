import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { AudioFileReference } from "../../../../../../../data/interfaces/references/audioFileReference";
import { ConstructReference } from "../../../../../../../data/interfaces/references/constructReference";
import { CommandData } from "../../../command/commandData";

export interface SayCommandData extends CommandData<"SayCommand"> {
  dialogUI: DynamicData<ConstructReference>;
  character: DynamicData<ConstructReference>;
  dialogText: DynamicData<string>;
  voiceOver: DynamicData<AudioFileReference>;
}

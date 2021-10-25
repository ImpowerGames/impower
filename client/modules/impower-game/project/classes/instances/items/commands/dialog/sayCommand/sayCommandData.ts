import { AudioFileReference } from "../../../../../../../data/interfaces/references/audioFileReference";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";
import { ConstructReference } from "../../../../../../../data/interfaces/references/constructReference";
import { CommandTypeId } from "../../../command/commandTypeId";

export interface SayCommandData extends CommandData<CommandTypeId.SayCommand> {
  dialogUI: DynamicData<ConstructReference>;
  character: DynamicData<ConstructReference>;
  dialogText: DynamicData<string>;
  voiceOver: DynamicData<AudioFileReference>;
}

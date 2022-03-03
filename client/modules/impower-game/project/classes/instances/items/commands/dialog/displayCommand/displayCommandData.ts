import { DisplayPosition } from "../../../../../../../data/enums/displayPosition";
import { DisplayType } from "../../../../../../../data/enums/displayType";
import { AudioFileReference } from "../../../../../../../data/interfaces/references/audioFileReference";
import { CommandData } from "../../../command/commandData";

export interface DisplayCommandData extends CommandData<"DisplayCommand"> {
  type: DisplayType;
  position: DisplayPosition;
  character: string;
  portrait: string;
  parenthetical: string;
  content: string;
  voice: AudioFileReference;
  ui: string;
}

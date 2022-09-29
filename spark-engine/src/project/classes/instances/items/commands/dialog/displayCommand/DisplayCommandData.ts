import { DisplayPosition } from "../../../../../../../data/enums/DisplayPosition";
import { DisplayType } from "../../../../../../../data/enums/displayType";
import { CommandData } from "../../../command/CommandData";

export interface DisplayCommandData extends CommandData<"DisplayCommand"> {
  type: DisplayType;
  position: DisplayPosition;
  character: string;
  parenthetical: string;
  content: string;
  autoAdvance: boolean;
  clearPreviousText: boolean;
}

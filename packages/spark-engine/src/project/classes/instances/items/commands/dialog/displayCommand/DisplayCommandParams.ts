import { DisplayPosition } from "../../../../../../../data/enums/DisplayPosition";
import { DisplayType } from "../../../../../../../data/enums/displayType";
import { CommandParams } from "../../../command/CommandParams";

export interface DisplayCommandParams extends CommandParams {
  type: DisplayType;
  position: DisplayPosition;
  character: string;
  parenthetical: string;
  content: string;
  autoAdvance: boolean;
  clearPreviousText: boolean;
}

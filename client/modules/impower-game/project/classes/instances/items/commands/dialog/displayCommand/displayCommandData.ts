import { DisplayPosition } from "../../../../../../../data/enums/displayPosition";
import { DisplayType } from "../../../../../../../data/enums/displayType";
import { CommandData } from "../../../command/commandData";

export interface DisplayCommandData extends CommandData<"DisplayCommand"> {
  type: DisplayType;
  position: DisplayPosition;
  character: string;
  parenthetical: string;
  content: string;
  ui: string;
}

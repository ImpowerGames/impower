import { DisplayType } from "../../../../../../../data/enums/displayType";
import { CommandParams } from "../../../command/CommandParams";

export interface DisplayCommandParams extends CommandParams {
  type: DisplayType;
  position: string;
  characterName: string;
  characterParenthetical: string;
  content: {
    tag: string;
    text?: string;
    layer?: string;
    image?: string[];
    audio?: string[];
    args?: string[];
  }[];
  autoAdvance: boolean;
  clearOnAdvance: boolean;
}

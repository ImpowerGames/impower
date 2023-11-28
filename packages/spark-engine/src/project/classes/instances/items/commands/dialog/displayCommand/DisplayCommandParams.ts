import { DisplayType } from "../../../../../../../data/enums/displayType";
import { CommandParams } from "../../../command/CommandParams";

export interface DisplayContentItem {
  tag?: string;
  prerequisite?: string;
  speed?: number;
  text?: string;
  layer?: string;
  image?: string[];
  audio?: string[];
  args?: string[];
}

export interface DisplayCommandParams extends CommandParams {
  type: DisplayType;
  position: string;
  characterName: string;
  characterParenthetical: string;
  content: DisplayContentItem[];
  autoAdvance: boolean;
  overwriteText: boolean;
}

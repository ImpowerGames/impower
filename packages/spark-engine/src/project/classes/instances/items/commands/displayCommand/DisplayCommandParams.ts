import { CommandParams } from "../../command/CommandParams";

export interface DisplayContentItem {
  tag?: string;
  prerequisite?: string;
  button?: string;
  text?: string;
  target?: string;
  image?: string[];
  audio?: string[];
  args?: string[];
}

export interface DisplayCommandParams extends CommandParams {
  type: "action" | "transition" | "scene" | "dialogue";
  position: string;
  characterKey: string;
  content: DisplayContentItem[];
  autoAdvance: boolean;
}

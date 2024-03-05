import { CommandParams } from "../../../../game/modules/logic/types/CommandParams";

export interface DisplayContentItem {
  tag?: string;
  prerequisite?: string;
  instance?: number;
  button?: string;
  text?: string;
  target?: string;
  image?: string[];
  audio?: string[];
  args?: string[];
}

export interface DisplayCommandParams extends CommandParams {
  type: "action" | "transition" | "scene" | "dialogue";
  position: number;
  characterKey: string;
  content: DisplayContentItem[];
  autoAdvance: boolean;
}

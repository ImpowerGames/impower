import { CommandParams } from "../../../../game/modules/logic/types/CommandParams";

export interface DisplayContentItem {
  tag?: string;
  type?: string;
  prerequisite?: string;
  instance?: number;
  button?: string;
  text?: string;
  control?: string;
  target?: string;
  assets?: string[];
  args?: string[];
}

export interface DisplayCommandParams extends CommandParams {
  type: "action" | "transition" | "scene" | "dialogue";
  position: number;
  characterKey: string;
  content: DisplayContentItem[];
  autoAdvance: boolean;
}

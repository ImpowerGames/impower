import type { StoryEnding } from "@impower/sparkdown/src/program/ProgramStory";
import type { TextInstruction } from "../../../core/types/Instruction";

export type PageEntryKind =
  | "action"
  | "dialogue"
  | "heading"
  | "rule"
  | "caption"
  | "options"
  | "chosen"
  | "ending";

export interface PageEntry {
  kind: PageEntryKind;
  scene?: string | null;
  speaker?: string;
  name?: string;
  text?: TextInstruction[];
  shown?: number;
  caption?: string;
  options?: TextInstruction[][];
  ending?: StoryEnding;
}

export interface PageRecord {
  keep: number;
  entries: PageEntry[];
}

export interface PageState {
  entries: PageEntry[];
  current: number;
  key?: string;
  absorbed?: PageEntry[];
  shown?: number;
  beat?: number;
  ending?: StoryEnding;
}

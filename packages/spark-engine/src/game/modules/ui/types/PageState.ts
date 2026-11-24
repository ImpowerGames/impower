import type { StoryEnding } from "@impower/sparkdown/src/program/ProgramStory";
import type { TextInstruction } from "../../../core/types/Instruction";

export const PAGE_ENTRY_KINDS = [
  "action",
  "dialogue",
  "heading",
  "rule",
  "options",
  "chosen",
  "ending",
] as const;

export type PageEntryKind = (typeof PAGE_ENTRY_KINDS)[number];

export interface PageEntry {
  kind: PageEntryKind;
  scene?: string | null;
  speaker?: string;
  name?: string;
  text?: TextInstruction[];
  shown?: number;
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

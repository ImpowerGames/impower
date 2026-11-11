import type { TextInstruction } from "../../../core/types/Instruction";

export type PageEntryKind =
  | "action"
  | "dialogue"
  | "heading"
  | "rule"
  | "caption"
  | "options"
  | "chosen";

export interface PageEntry {
  kind: PageEntryKind;
  scene?: string | null;
  speaker?: string;
  name?: string;
  text?: TextInstruction[];
  shown?: number;
  caption?: string;
  options?: TextInstruction[][];
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
}

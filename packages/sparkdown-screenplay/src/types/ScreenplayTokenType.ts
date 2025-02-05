import { PagePosition } from "./PagePosition";

export type MetadataTokenType =
  | "title"
  | "credit"
  | "author"
  | "source"
  | "notes"
  | "date"
  | "contact"
  | "revision"
  | "copyright"
  | PagePosition;

export type PageBreakTokenType = "page_break";

export type BlockTokenType =
  | "knot"
  | "stitch"
  | "scene"
  | "transition"
  | "action"
  | "dialogue"
  | "more";

export type DialogueTokenType =
  | "dialogue_character"
  | "dialogue_parenthetical"
  | "dialogue_content";

export type ScreenplayTokenType =
  | PageBreakTokenType
  | MetadataTokenType
  | BlockTokenType
  | DialogueTokenType;

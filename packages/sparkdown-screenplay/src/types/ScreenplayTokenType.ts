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

export type SeparatorTokenType = "separator";

export type BlockTokenType =
  | "knot"
  | "stitch"
  | "scene"
  | "transition"
  | "action"
  | "dialogue"
  | "choice";

export type DialogueTokenType =
  | "dialogue_character"
  | "dialogue_parenthetical"
  | "dialogue_content"
  | "dialogue_more";

export type ScreenplayTokenType =
  | PageBreakTokenType
  | SeparatorTokenType
  | MetadataTokenType
  | BlockTokenType
  | DialogueTokenType;

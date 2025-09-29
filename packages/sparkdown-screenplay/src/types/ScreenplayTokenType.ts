import { PagePosition } from "./PagePosition";

export type FrontMatterKey =
  | "title"
  | "credit"
  | "author"
  | "source"
  | "notes"
  | "date"
  | "contact"
  | "revision"
  | "copyright";

export type MetadataTokenType =
  | `meta:${FrontMatterKey}`
  | `meta:${PagePosition}`;

export type PageBreakTokenType = "page_break";

export type SeparatorTokenType = "separator";

export type BlockTokenType =
  | "function"
  | "scene"
  | "branch"
  | "knot"
  | "stitch"
  | "title"
  | "heading"
  | "transitional"
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

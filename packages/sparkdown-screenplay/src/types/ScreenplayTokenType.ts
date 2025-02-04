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

export type BodyTokenType =
  | "page_break"
  | "knot"
  | "stitch"
  | "scene"
  | "transition"
  | "action"
  | "dialogue_character"
  | "parenthetical"
  | "dialogue"
  | "more"
  | "note";

export type ScreenplayTokenType = MetadataTokenType | BodyTokenType;

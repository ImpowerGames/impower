import { DataDocument } from "../../../impower-core";

export interface PhraseDocument extends DataDocument<"PhraseDocument"> {
  tags: string[];

  readonly approved?: boolean;

  score?: number;
  likes?: number;
  dislikes?: number;

  readonly rank?: number;
  readonly rating?: number;

  readonly suggestions?: number;
}

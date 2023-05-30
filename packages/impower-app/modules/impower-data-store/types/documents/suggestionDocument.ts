import { DataDocument } from "../../../impower-core";

export interface SuggestionDocument extends DataDocument<"SuggestionDocument"> {
  edit: string;
  reason: string;
  tags: string[];
  selectedTags: string[];
}

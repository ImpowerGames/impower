import { SuggestionDocument } from "../types/documents/suggestionDocument";

const isSuggestionDocument = (obj: unknown): obj is SuggestionDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as SuggestionDocument;
  return doc._documentType === "SuggestionDocument";
};

export default isSuggestionDocument;

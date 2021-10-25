import { createDataDocument } from "../../impower-core";
import { SuggestionDocument } from "../types/documents/suggestionDocument";

const createSuggestionDocument = (
  doc?: Partial<SuggestionDocument>
): SuggestionDocument => {
  return {
    ...createDataDocument(),
    _documentType: "SuggestionDocument",
    edit: "",
    reason: "",
    tags: [],
    selectedTags: [],
    ...doc,
  };
};

export default createSuggestionDocument;

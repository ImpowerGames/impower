import { createDataDocument } from "../../impower-core";
import { PhraseDocument } from "../types/documents/phraseDocument";

const createPhraseDocument = (
  doc?: Partial<PhraseDocument>
): PhraseDocument => {
  return {
    ...createDataDocument(),
    _documentType: "PhraseDocument",
    tags: [],
    ...doc,
  };
};

export default createPhraseDocument;

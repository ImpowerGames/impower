import { PhraseDocument } from "../types/documents/phraseDocument";

const isPhraseDocument = (obj: unknown): obj is PhraseDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as PhraseDocument;
  return doc._documentType === "PhraseDocument";
};

export default isPhraseDocument;

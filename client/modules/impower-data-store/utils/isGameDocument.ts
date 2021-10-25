import { GameDocument } from "../types/documents/gameDocument";

const isGameDocument = (obj: unknown): obj is GameDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as GameDocument;
  return doc._documentType === "GameDocument";
};

export default isGameDocument;

import { PathDocument } from "../types/documents/pathDocument";

const isPathDocument = (obj: unknown): obj is PathDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as PathDocument;
  return doc._documentType === "PathDocument";
};

export default isPathDocument;

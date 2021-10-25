import { TagDocument } from "../types/documents/tagDocument";

const isTagDocument = (obj: unknown): obj is TagDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as TagDocument;
  return doc._documentType === "TagDocument";
};

export default isTagDocument;

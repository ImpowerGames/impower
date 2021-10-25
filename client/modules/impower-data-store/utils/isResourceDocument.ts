import { ResourceDocument } from "../types/documents/resourceDocument";

const isResourceDocument = (obj: unknown): obj is ResourceDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as ResourceDocument;
  return doc._documentType === "ResourceDocument";
};

export default isResourceDocument;

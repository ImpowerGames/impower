import { StudioDocument } from "../types/documents/studioDocument";

const isStudioDocument = (obj: unknown): obj is StudioDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as StudioDocument;
  return doc._documentType === "StudioDocument";
};

export default isStudioDocument;

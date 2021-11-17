import { AccessDocument } from "../types/documents/accessDocument";

const isAccessDocument = (obj: unknown): obj is AccessDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as AccessDocument;
  return (
    doc._documentType === "StudioDocument" ||
    doc._documentType === "ProjectDocument"
  );
};

export default isAccessDocument;

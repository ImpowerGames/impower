import { PageDocument } from "../types/documents/pageDocument";

const isPageDocument = (obj: unknown): obj is PageDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as PageDocument;
  return (
    doc._documentType === "GameDocument" ||
    doc._documentType === "ResourceDocument" ||
    doc._documentType === "StudioDocument"
  );
};

export default isPageDocument;

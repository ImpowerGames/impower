import { PageDocument } from "../types/documents/pageDocument";

const isPageDocument = (obj: unknown): obj is PageDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as PageDocument;
  return (
    doc._documentType === "StudioDocument" ||
    doc._documentType === "ProjectDocument"
  );
};

export default isPageDocument;

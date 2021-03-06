import { ProjectDocument } from "../types/documents/projectDocument";

const isProjectDocument = (obj: unknown): obj is ProjectDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as ProjectDocument;
  return doc._documentType === "ProjectDocument";
};

export default isProjectDocument;

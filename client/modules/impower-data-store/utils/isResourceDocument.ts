import { ProjectDocument } from "../types/documents/projectDocument";

const isResourceDocument = (obj: unknown): obj is ProjectDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as ProjectDocument;
  return doc._documentType === "ProjectDocument" && doc.projectType !== "game";
};

export default isResourceDocument;

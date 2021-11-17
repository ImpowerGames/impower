import { ProjectDocument } from "../types/documents/projectDocument";
import createProjectDocument from "./createProjectDocument";

const createResourceDocument = (
  doc?: Partial<ProjectDocument>
): ProjectDocument => {
  return {
    ...createProjectDocument(),
    _documentType: "ProjectDocument",
    ...doc,
  };
};

export default createResourceDocument;

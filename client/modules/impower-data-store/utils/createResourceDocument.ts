import { ResourceDocument } from "../types/documents/resourceDocument";
import createProjectDocument from "./createProjectDocument";

const createResourceDocument = (
  doc?: Partial<ResourceDocument>
): ResourceDocument => {
  return {
    ...createProjectDocument(),
    _documentType: "ResourceDocument",
    ...doc,
  };
};

export default createResourceDocument;

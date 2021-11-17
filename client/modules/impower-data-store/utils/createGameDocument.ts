import { ProjectDocument } from "..";
import createProjectDocument from "./createProjectDocument";

const createGameDocument = (
  doc?: Partial<ProjectDocument>
): ProjectDocument => {
  return {
    ...createProjectDocument(),
    _documentType: "ProjectDocument",
    projectType: "game",
    ...doc,
  };
};

export default createGameDocument;

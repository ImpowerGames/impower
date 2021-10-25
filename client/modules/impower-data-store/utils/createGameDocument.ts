import { GameDocument } from "../types/documents/gameDocument";
import createProjectDocument from "./createProjectDocument";

const createGameDocument = (doc?: Partial<GameDocument>): GameDocument => {
  return {
    ...createProjectDocument(),
    _documentType: "GameDocument",
    ...doc,
  };
};

export default createGameDocument;

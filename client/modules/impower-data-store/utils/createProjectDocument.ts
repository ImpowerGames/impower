import { Timestamp } from "../../impower-core";
import { ProjectDocument } from "../types/documents/projectDocument";
import { DevelopmentStatus } from "../types/enums/developmentStatus";
import { PitchGoal } from "../types/enums/pitchGoal";
import createPageDocument from "./createPageDocument";

const createProjectDocument = (
  doc?: Partial<ProjectDocument>
): ProjectDocument => {
  return {
    ...createPageDocument(),
    _documentType: "ProjectDocument",
    slug: "",
    pitched: false,
    pitchedAt: new Timestamp(),
    repitchedAt: new Timestamp(),
    pitchGoal: PitchGoal.Collaboration,
    restricted: false,
    version: "0.0.1",
    status: DevelopmentStatus.InDevelopment,
    studio: "",
    preview: {
      storageKey: "",
      fileUrl: "",
      fileType: "image/png,image/jpeg",
      fileExtension: null,
    },
    screenshots: {
      default: {
        storageKey: "",
        fileUrl: "",
        fileType: "image/png,image/jpeg",
        fileExtension: null,
      },
      order: [],
      data: {},
    },
    engine: false,
    ...doc,
  };
};

export default createProjectDocument;

import { Timestamp } from "../../impower-core";
import { PageDocument } from "../types/documents/pageDocument";
import { ProjectDocument } from "../types/documents/projectDocument";
import { DevelopmentStatus } from "../types/enums/developmentStatus";
import { PitchGoal } from "../types/enums/pitchGoal";
import createPageDocument from "./createPageDocument";

const createProjectDocument = (
  doc?: Partial<ProjectDocument> & Pick<PageDocument, "_documentType">
): ProjectDocument => {
  return {
    ...createPageDocument(),
    slug: "",
    pitched: false,
    pitchedAt: new Timestamp(),
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

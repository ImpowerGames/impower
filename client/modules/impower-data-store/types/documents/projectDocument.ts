import { List, StorageFile, Timestamp } from "../../../impower-core";
import { InfoAttributes } from "../../../impower-data-state/types/interfaces/infoAttributes";
import { DevelopmentStatus } from "../enums/developmentStatus";
import { PitchGoal } from "../enums/pitchGoal";
import { ProjectType } from "../enums/projectType";
import { PageDocument } from "./pageDocument";

export interface ProjectDocument extends PageDocument<"ProjectDocument"> {
  studioInfo?: InfoAttributes;
  projectType?: ProjectType;
  studio: string;
  slug: string; // This is a unique human-readable id that can be used to look up this page
  version: string;
  status: DevelopmentStatus;
  preview: StorageFile;
  screenshots: List<StorageFile>;
  restricted: boolean;
  pitched: boolean;
  pitchedAt: string | Timestamp;
  repitchedAt: string | Timestamp;
  pitchGoal: PitchGoal;
  engine: boolean;

  contributions?: number;

  og?: string;
}

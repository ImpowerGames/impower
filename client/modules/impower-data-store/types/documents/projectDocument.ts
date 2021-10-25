import { List, StorageFile, Timestamp } from "../../../impower-core";
import { DevelopmentStatus } from "../enums/developmentStatus";
import { PitchGoal } from "../enums/pitchGoal";
import { PageDocument } from "./pageDocument";

export interface ProjectDocument<T extends string = string>
  extends PageDocument<T> {
  studio: string;
  slug: string; // This is a unique human-readable id that can be used to look up this page
  version: string;
  status: DevelopmentStatus;
  preview: StorageFile;
  screenshots: List<StorageFile>;
  restricted: boolean;
  pitched: boolean;
  pitchedAt: string | Timestamp;
  pitchGoal: PitchGoal;
  engine: boolean;

  contributions?: number;

  og?: string;
}

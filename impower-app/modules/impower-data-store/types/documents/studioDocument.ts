import { PlanType } from "../../../impower-auth";
import { DeveloperStatus } from "../enums/developerStatus";
import { PageDocument } from "./pageDocument";

export interface StudioDocument extends PageDocument<"StudioDocument"> {
  handle: string; // This is a unique human-readable id that can be used to look up this studio
  status: DeveloperStatus;
  neededRoles: string[];

  readonly plan?: PlanType;
}

import { MemberAccess } from "../../../impower-data-state";
import {
  GameProjectData,
  ResourceProjectData,
} from "../../../impower-game/data";

export interface ProjectState {
  id?: string;
  data?: GameProjectData | ResourceProjectData;
  collection?: "games" | "resources";
  access?: MemberAccess;
  lastActionDescription?: string;
  lastActionTargets?: string[];
}

export const createProjectState = (): ProjectState => ({});

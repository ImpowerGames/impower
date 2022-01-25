import { MemberAccess } from "../../../impower-data-state";
import { GameProjectData } from "../../../impower-game/data";

export interface ProjectState {
  id?: string;
  data?: GameProjectData;
  access?: MemberAccess;
  lastActionDescription?: string;
  lastActionTargets?: string[];
}

export const createProjectState = (): ProjectState => ({});

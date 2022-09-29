import { MemberAccess } from "../../../impower-data-state";
import { CollaborativeGameProjectData } from "./collaborativeGameProjectData";

export interface ProjectState {
  id?: string;
  data?: CollaborativeGameProjectData;
  access?: MemberAccess;
}

import { Collection } from "../../../../impower-core";
import { MemberData } from "../../../../impower-data-state";
import { ProjectDocument } from "../../../../impower-data-store";
import { InstanceData } from "../instance/instanceData";

export interface ProjectData {
  doc?: ProjectDocument;
  members?: Collection<MemberData>;
  scripts?: {
    [id: string]: Collection<string>;
  };
  instances?: {
    [id: string]: Collection<InstanceData>;
  };
}

export const createProjectData = (obj?: Partial<ProjectData>): ProjectData => ({
  ...obj,
});

export const isProjectData = (obj: unknown): obj is ProjectData => {
  if (!obj) {
    return false;
  }
  const projectData = obj as ProjectData;
  return projectData.members !== undefined;
};

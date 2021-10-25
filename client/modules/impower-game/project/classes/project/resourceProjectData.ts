import { Collection } from "../../../../impower-core";
import { FileData } from "../instances/file/fileData";
import { FolderData } from "../instances/folder/folderData";
import { createProjectData, isProjectData, ProjectData } from "./projectData";

export interface ResourceProjectData extends ProjectData {
  instances?: {
    files: Collection<FileData>;
    folders: Collection<FolderData>;
  };
}

export const createResourceProjectData = (
  obj?: Partial<ResourceProjectData>
): ResourceProjectData => ({
  ...createProjectData(obj),
  instances: {
    files: { data: {} },
    folders: { data: {} },
  },
});

export const isResourceProjectData = (
  obj: unknown
): obj is ResourceProjectData => {
  if (!obj) {
    return false;
  }
  const data = obj as ProjectData;
  return (
    isProjectData(data) &&
    data?.instances?.constructs === undefined &&
    data?.instances?.blocks === undefined
  );
};

import { Collection } from "../../../data/interfaces/Collection";
import { FileData } from "../instances/file/FileData";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FilesCollection extends Collection<FileData> {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ScriptsCollection extends Collection<string> {}
export interface InstancesCollection {
  [id: string]: Collection<Record<string, unknown>>;
}

export interface ProjectData {
  files?: FilesCollection;
  scripts?: ScriptsCollection;
  instances?: InstancesCollection;
}

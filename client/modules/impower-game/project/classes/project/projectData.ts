import { Collection } from "../../../../impower-core";
import { MemberData } from "../../../../impower-data-state";
import { ProjectDocument } from "../../../../impower-data-store";
import { FileData } from "../instances/file/fileData";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MembersCollection extends Collection<MemberData> {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FilesCollection extends Collection<FileData> {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ScriptsCollection extends Collection<string> {}
export interface InstancesCollection {
  [id: string]: Collection<Record<string, unknown>>;
}

export interface ProjectData {
  doc?: ProjectDocument;
  members?: MembersCollection;
  files?: FilesCollection;
  scripts?: ScriptsCollection;
  instances?: InstancesCollection;
}

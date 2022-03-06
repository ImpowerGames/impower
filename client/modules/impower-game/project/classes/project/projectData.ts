import { Collection } from "../../../../impower-core";
import { MemberData } from "../../../../impower-data-state";
import { ProjectDocument } from "../../../../impower-data-store";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MembersCollection extends Collection<MemberData> {}
export interface ScriptsCollection {
  [id: string]: Collection<string>;
}
export interface InstancesCollection {
  [id: string]: Collection<Record<string, unknown>>;
}

export interface ProjectData {
  doc?: ProjectDocument;
  members?: MembersCollection;
  scripts?: ScriptsCollection;
  instances?: InstancesCollection;
}

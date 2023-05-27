import { Collection, GameProjectData } from "../../../../../spark-engine";
import { MemberData } from "../../../impower-data-state";
import { ProjectDocument } from "../../../impower-data-store";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MembersCollection extends Collection<MemberData> {}

export interface CollaborativeGameProjectData extends GameProjectData {
  doc?: ProjectDocument;
  members?: MembersCollection;
}

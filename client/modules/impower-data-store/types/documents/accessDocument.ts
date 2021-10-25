import { Collection, DataDocument } from "../../../impower-core";
import { MemberData } from "../../../impower-data-state";

export interface AccessDocument<T extends string = string>
  extends DataDocument<T> {
  claimed?: boolean;
  owners: string[];
  changedMembers?: Collection<MemberData>;
}

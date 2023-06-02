import { MemberData } from "../types/interfaces/memberData";

const isMemberData = (obj: unknown): obj is MemberData => {
  if (!obj) {
    return false;
  }
  const memberData = obj as MemberData;
  return memberData.g !== undefined && memberData.access !== undefined;
};

export default isMemberData;

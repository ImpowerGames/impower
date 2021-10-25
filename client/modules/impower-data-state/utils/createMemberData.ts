import { MemberData } from "../types/interfaces/memberData";

const createMemberData = (
  obj?: Partial<MemberData> & Pick<MemberData, "g"> & Pick<MemberData, "access">
): MemberData => ({
  role: "",
  ...obj,
});

export default createMemberData;

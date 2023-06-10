import { MemberData } from "../../../impower-data-state";

export const USER_LOAD_MY_MEMBERSHIPS =
  "impower/user/USER_LOAD_MY_MEMBERSHIPS";
export interface UserLoadMyMembershipsAction {
  type: typeof USER_LOAD_MY_MEMBERSHIPS;
  payload: {
    my_memberships: {
      [key: string]: MemberData;
    };
  };
}

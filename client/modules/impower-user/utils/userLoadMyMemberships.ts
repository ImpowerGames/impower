import { MemberData } from "../../impower-data-state";
import {
  UserLoadMyMembershipsAction,
  USER_LOAD_MY_MEMBERSHIPS,
} from "../types/actions/userLoadMyMembershipsAction";

const userLoadMyMemberships = (my_memberships: {
  [key: string]: MemberData;
}): UserLoadMyMembershipsAction => {
  return {
    type: USER_LOAD_MY_MEMBERSHIPS,
    payload: { my_memberships },
  };
};

export default userLoadMyMemberships;

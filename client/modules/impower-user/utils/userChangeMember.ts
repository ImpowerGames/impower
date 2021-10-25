import { MemberData, PageMemberWritePath } from "../../impower-data-state";
import {
  UserChangeMemberAction,
  USER_CHANGE_MEMBER,
} from "../types/actions/userChangeMemberAction";

const userChangeMember = (
  data: MemberData,
  ...path: PageMemberWritePath
): UserChangeMemberAction => {
  return {
    type: USER_CHANGE_MEMBER,
    payload: { data, path },
  };
};

export default userChangeMember;

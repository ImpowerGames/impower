import { MemberData, PageMemberWritePath } from "../../impower-data-state";
import {
  UserChangeMemberAction,
  USER_CHANGE_MEMBER,
} from "../types/actions/userChangeMemberAction";

const userOnChangeMember = (
  onFinished: () => void,
  data: MemberData,
  ...path: PageMemberWritePath
): UserChangeMemberAction => {
  return {
    type: USER_CHANGE_MEMBER,
    payload: { onFinished, data, path },
  };
};

export default userOnChangeMember;

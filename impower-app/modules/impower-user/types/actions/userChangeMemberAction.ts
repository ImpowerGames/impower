import { MemberData, PageMemberWritePath } from "../../../impower-data-state";

export const USER_CHANGE_MEMBER = "impower/user/CHANGE_MEMBER";
export interface UserChangeMemberAction {
  type: typeof USER_CHANGE_MEMBER;
  payload: {
    onFinished?: () => void;
    data: MemberData;
    path: PageMemberWritePath;
  };
}

import { InteractiveDocumentPath } from "../../../impower-api";

export const USER_REJECT_CONNECT = "@impower/user/REJECT_CONNECT";
export interface UserRejectConnectAction {
  type: typeof USER_REJECT_CONNECT;
  payload: {
    onFinished?: () => void;
    path: InteractiveDocumentPath;
  };
}

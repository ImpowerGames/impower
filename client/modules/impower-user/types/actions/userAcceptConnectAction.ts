import { InteractiveDocumentPath } from "../../../impower-api";

export const USER_ACCEPT_CONNECT = "@impower/user/ACCEPT_CONNECT";
export interface UserAcceptConnectAction {
  type: typeof USER_ACCEPT_CONNECT;
  payload: {
    onFinished?: () => void;
    path: InteractiveDocumentPath;
  };
}

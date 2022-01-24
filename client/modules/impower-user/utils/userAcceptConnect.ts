import { InteractiveDocumentPath } from "../../impower-api";
import {
  UserAcceptConnectAction,
  USER_ACCEPT_CONNECT,
} from "../types/actions/userAcceptConnectAction";

const userAcceptConnect = (
  ...path: InteractiveDocumentPath
): UserAcceptConnectAction => {
  return {
    type: USER_ACCEPT_CONNECT,
    payload: { path },
  };
};

export default userAcceptConnect;

import { InteractiveDocumentPath } from "../../impower-api";
import {
  UserRejectConnectAction,
  USER_REJECT_CONNECT,
} from "../types/actions/userRejectConnectAction";

const userRejectConnect = (
  ...path: InteractiveDocumentPath
): UserRejectConnectAction => {
  return {
    type: USER_REJECT_CONNECT,
    payload: { path },
  };
};

export default userRejectConnect;

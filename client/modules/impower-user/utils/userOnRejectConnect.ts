import { InteractiveDocumentPath } from "../../impower-api";
import {
  UserRejectConnectAction,
  USER_REJECT_CONNECT,
} from "../types/actions/userRejectConnectAction";

const userOnRejectConnect = (
  onFinished: () => void,
  ...path: InteractiveDocumentPath
): UserRejectConnectAction => {
  return {
    type: USER_REJECT_CONNECT,
    payload: { onFinished, path },
  };
};

export default userOnRejectConnect;

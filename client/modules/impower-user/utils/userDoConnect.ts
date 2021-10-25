import { InteractiveDocumentPath } from "../../impower-api";
import {
  UserDoActivityAction,
  USER_DO_ACTIVITY,
} from "../types/actions/userDoActivityAction";

const userDoConnect = (
  ...path: InteractiveDocumentPath
): UserDoActivityAction => {
  return {
    type: USER_DO_ACTIVITY,
    payload: { path, type: "connects" },
  };
};

export default userDoConnect;

import { InteractiveDocumentPath } from "../../impower-api";
import {
  UserDoActivityAction,
  USER_DO_ACTIVITY,
} from "../types/actions/userDoActivityAction";

const userDoFollow = (
  ...path: InteractiveDocumentPath
): UserDoActivityAction => {
  return {
    type: USER_DO_ACTIVITY,
    payload: { path, type: "follows" },
  };
};

export default userDoFollow;

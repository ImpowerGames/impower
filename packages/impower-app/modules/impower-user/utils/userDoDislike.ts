import { InteractiveDocumentPath } from "../../impower-api";
import {
  UserDoActivityAction,
  USER_DO_ACTIVITY,
} from "../types/actions/userDoActivityAction";

const userDoDislike = (
  ...path: InteractiveDocumentPath
): UserDoActivityAction => {
  return {
    type: USER_DO_ACTIVITY,
    payload: { path, type: "dislikes" },
  };
};

export default userDoDislike;

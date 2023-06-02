import { InteractiveDocumentPath } from "../../impower-api";
import {
  UserDoActivityAction,
  USER_DO_ACTIVITY,
} from "../types/actions/userDoActivityAction";

const userDoLike = (...path: InteractiveDocumentPath): UserDoActivityAction => {
  return {
    type: USER_DO_ACTIVITY,
    payload: { path, type: "likes" },
  };
};

export default userDoLike;

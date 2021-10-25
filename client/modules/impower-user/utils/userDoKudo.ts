import { InteractiveDocumentPath } from "../../impower-api";
import {
  UserDoActivityAction,
  USER_DO_ACTIVITY,
} from "../types/actions/userDoActivityAction";

const userDoKudo = (
  c: string,
  ...path: InteractiveDocumentPath
): UserDoActivityAction => {
  return {
    type: USER_DO_ACTIVITY,
    payload: { c, path, type: "kudos" },
  };
};

export default userDoKudo;

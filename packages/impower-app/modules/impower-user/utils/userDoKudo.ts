import { InteractiveDocumentPath } from "../../impower-api";
import { AggData } from "../../impower-data-state";
import {
  UserDoActivityAction,
  USER_DO_ACTIVITY,
} from "../types/actions/userDoActivityAction";

const userDoKudo = (
  aggData: AggData,
  ...path: InteractiveDocumentPath
): UserDoActivityAction => {
  return {
    type: USER_DO_ACTIVITY,
    payload: { aggData, path, type: "kudos" },
  };
};

export default userDoKudo;

import { InteractiveDocumentPath } from "../../impower-api";
import { AggData } from "../../impower-data-state";
import {
  UserDoActivityAction,
  USER_DO_ACTIVITY,
} from "../types/actions/userDoActivityAction";

const userDoReport = (
  aggData: AggData,
  ...path: InteractiveDocumentPath
): UserDoActivityAction => {
  return {
    type: USER_DO_ACTIVITY,
    payload: { aggData, path, type: "reports" },
  };
};

export default userDoReport;

import { InteractiveDocumentPath } from "../../impower-api";
import {
  UserUndoActivityAction,
  USER_UNDO_ACTIVITY,
} from "../types/actions/userUndoActivityAction";

const userUndoReport = (
  ...path: InteractiveDocumentPath
): UserUndoActivityAction => {
  return {
    type: USER_UNDO_ACTIVITY,
    payload: { path, type: "reports" },
  };
};

export default userUndoReport;

import { InteractiveDocumentPath } from "../../impower-api";
import {
  UserUndoActivityAction,
  USER_UNDO_ACTIVITY,
} from "../types/actions/userUndoActivityAction";

const userUndoConnect = (
  ...path: InteractiveDocumentPath
): UserUndoActivityAction => {
  return {
    type: USER_UNDO_ACTIVITY,
    payload: { path, type: "connects" },
  };
};

export default userUndoConnect;

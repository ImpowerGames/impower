import { InteractiveDocumentPath } from "../../impower-api";
import {
  UserUndoActivityAction,
  USER_UNDO_ACTIVITY,
} from "../types/actions/userUndoActivityAction";

const userUndoKudo = (
  ...path: InteractiveDocumentPath
): UserUndoActivityAction => {
  return {
    type: USER_UNDO_ACTIVITY,
    payload: { path, type: "kudos" },
  };
};

export default userUndoKudo;

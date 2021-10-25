import { InteractiveDocumentPath } from "../../impower-api";
import {
  UserUndoActivityAction,
  USER_UNDO_ACTIVITY,
} from "../types/actions/userUndoActivityAction";

const userUndoLike = (
  ...path: InteractiveDocumentPath
): UserUndoActivityAction => {
  return {
    type: USER_UNDO_ACTIVITY,
    payload: { path, type: "likes" },
  };
};

export default userUndoLike;

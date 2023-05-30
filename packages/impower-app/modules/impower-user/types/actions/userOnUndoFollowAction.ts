import { InteractiveDocumentPath } from "../../../impower-api";
import {
  UserUndoActivityAction,
  USER_UNDO_ACTIVITY,
} from "./userUndoActivityAction";

export const userOnUndoFollow = (
  onFinished: () => void,
  ...path: InteractiveDocumentPath
): UserUndoActivityAction => {
  return {
    type: USER_UNDO_ACTIVITY,
    payload: { onFinished, path, type: "follows" },
  };
};

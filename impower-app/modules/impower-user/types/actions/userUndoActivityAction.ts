import { InteractiveDocumentPath, ActivityType } from "../../../impower-api";

export const USER_UNDO_ACTIVITY = "@impower/user/UNDO_ACTIVITY";
export interface UserUndoActivityAction {
  type: typeof USER_UNDO_ACTIVITY;
  payload: {
    onFinished?: () => void;
    path: InteractiveDocumentPath;
    type: ActivityType;
  };
}

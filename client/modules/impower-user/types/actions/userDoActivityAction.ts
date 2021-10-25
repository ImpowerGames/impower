import { InteractiveDocumentPath, ActivityType } from "../../../impower-api";

export const USER_DO_ACTIVITY = "@impower/user/DO_ACTIVITY";
export interface UserDoActivityAction {
  type: typeof USER_DO_ACTIVITY;
  payload: {
    onFinished?: () => void;
    c?: string;
    path: InteractiveDocumentPath;
    type: ActivityType;
  };
}

import { InteractiveDocumentPath } from "../../../impower-api";

export const USER_READ_NOTIFICATION = "@impower/user/READ_NOTIFICATION";
export interface UserReadNotificationAction {
  type: typeof USER_READ_NOTIFICATION;
  payload: {
    onFinished?: () => void;
    path: InteractiveDocumentPath;
  };
}

import { InteractiveDocumentPath } from "../../impower-api";
import { NotificationType } from "../../impower-api/types/enums/notificationType";
import {
  UserReadNotificationAction,
  USER_READ_NOTIFICATION,
} from "../types/actions/userReadNotificationAction";

const userReadNotification = (
  type: NotificationType,
  ...path: InteractiveDocumentPath
): UserReadNotificationAction => {
  return {
    type: USER_READ_NOTIFICATION,
    payload: { path, type },
  };
};

export default userReadNotification;

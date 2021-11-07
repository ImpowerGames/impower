import { AggData } from "../../impower-data-state";
import {
  UserLoadNotificationsAction,
  USER_LOAD_NOTIFICATIONS,
} from "../types/actions/userLoadNotificationsAction";

const userLoadNotifications = (notifications: {
  [key: string]: AggData;
}): UserLoadNotificationsAction => {
  return {
    type: USER_LOAD_NOTIFICATIONS,
    payload: {
      notifications,
    },
  };
};

export default userLoadNotifications;

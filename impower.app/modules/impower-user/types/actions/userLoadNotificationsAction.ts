import { AggData } from "../../../impower-data-state";

export const USER_LOAD_NOTIFICATIONS = "@impower/user/USER_LOAD_NOTIFICATIONS";
export interface UserLoadNotificationsAction {
  type: typeof USER_LOAD_NOTIFICATIONS;
  payload: {
    notifications: {
      [key: string]: AggData;
    };
  };
}

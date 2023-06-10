import { AggData } from "../../../impower-data-state";

export const USER_LOAD_MY_SUBMISSIONS =
  "impower/user/USER_LOAD_MY_SUBMISSIONS";
export interface UserLoadMySubmissionsAction {
  type: typeof USER_LOAD_MY_SUBMISSIONS;
  payload: {
    my_submissions: {
      [key: string]: AggData;
    };
  };
}

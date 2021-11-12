import { AggData } from "../../../impower-data-state";

export const USER_LOAD_MY_REPORTS = "@impower/user/USER_LOAD_MY_REPORTS";
export interface UserLoadMyReportsAction {
  type: typeof USER_LOAD_MY_REPORTS;
  payload: {
    my_reports: {
      [key: string]: AggData;
    };
  };
}

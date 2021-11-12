import { AggData } from "../../impower-data-state";
import {
  UserLoadMyReportsAction,
  USER_LOAD_MY_REPORTS,
} from "../types/actions/userLoadMyReportsAction";

const userLoadMyReports = (my_reports: {
  [key: string]: AggData;
}): UserLoadMyReportsAction => {
  return {
    type: USER_LOAD_MY_REPORTS,
    payload: {
      my_reports,
    },
  };
};

export default userLoadMyReports;

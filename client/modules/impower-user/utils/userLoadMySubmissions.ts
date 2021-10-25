import { AggData } from "../../impower-data-state";
import {
  UserLoadMySubmissionsAction,
  USER_LOAD_MY_SUBMISSIONS,
} from "../types/actions/userLoadMySubmissionsAction";

const userLoadMySubmissions = (my_submissions: {
  [key: string]: AggData;
}): UserLoadMySubmissionsAction => {
  return {
    type: USER_LOAD_MY_SUBMISSIONS,
    payload: {
      my_submissions,
    },
  };
};

export default userLoadMySubmissions;

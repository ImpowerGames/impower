import { SubmissionType } from "../../impower-api";
import { PathDocument } from "../../impower-data-store";
import {
  UserLoadSubmissionsAction,
  USER_LOAD_SUBMISSIONS,
} from "../types/actions/userLoadSubmissionsAction";

const userLoadSubmissions = (submissions: {
  [submissionType in SubmissionType]: PathDocument;
}): UserLoadSubmissionsAction => {
  return {
    type: USER_LOAD_SUBMISSIONS,
    payload: {
      submissions,
    },
  };
};

export default userLoadSubmissions;

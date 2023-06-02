import { SubmissionType } from "../../../impower-api";
import { PathDocument } from "../../../impower-data-store";

export const USER_LOAD_SUBMISSIONS = "@impower/user/USER_LOAD_SUBMISSIONS";
export interface UserLoadSubmissionsAction {
  type: typeof USER_LOAD_SUBMISSIONS;
  payload: {
    submissions: {
      [submissionType in SubmissionType]: PathDocument;
    };
  };
}

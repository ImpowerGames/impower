import { SubmissionDocumentPath } from "../../../impower-api";

export const USER_DELETE_SUBMISSION = "@impower/user/DELETE_SUBMISSION";
export interface UserDeleteSubmissionAction {
  type: typeof USER_DELETE_SUBMISSION;
  payload: {
    onFinished?: () => void;
    path: SubmissionDocumentPath;
  };
}

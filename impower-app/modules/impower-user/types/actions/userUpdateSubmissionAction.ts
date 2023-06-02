import { SubmissionDocumentPath } from "../../../impower-api";
import { SubmissionDocument } from "../../../impower-data-store";

export const USER_UPDATE_SUBMISSION = "@impower/user/UPDATE_SUBMISSION";
export interface UserUpdateSubmissionAction<
  T extends SubmissionDocument = SubmissionDocument
> {
  type: typeof USER_UPDATE_SUBMISSION;
  payload: {
    onFinished?: () => void;
    doc: T;
    path: SubmissionDocumentPath;
  };
}

import { SubmissionDocumentPath } from "../../../impower-api";
import { SubmissionDocument } from "../../../impower-data-store";

export const USER_CREATE_SUBMISSION = "impower/user/CREATE_SUBMISSION";
export interface UserCreateSubmissionAction<
  T extends SubmissionDocument = SubmissionDocument
> {
  type: typeof USER_CREATE_SUBMISSION;
  payload: {
    onFinished?: () => void;
    doc: T;
    path: SubmissionDocumentPath;
  };
}

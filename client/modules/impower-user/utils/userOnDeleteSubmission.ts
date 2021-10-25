import { SubmissionDocumentPath } from "../../impower-api";
import {
  UserDeleteSubmissionAction,
  USER_DELETE_SUBMISSION,
} from "../types/actions/userDeleteSubmissionAction";

const userOnDeleteSubmission = (
  onFinished: () => void,
  ...path: SubmissionDocumentPath
): UserDeleteSubmissionAction => {
  return {
    type: USER_DELETE_SUBMISSION,
    payload: { onFinished, path },
  };
};

export default userOnDeleteSubmission;

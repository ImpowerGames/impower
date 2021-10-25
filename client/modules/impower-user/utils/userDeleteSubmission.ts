import { SubmissionDocumentPath } from "../../impower-api";
import {
  UserDeleteSubmissionAction,
  USER_DELETE_SUBMISSION,
} from "../types/actions/userDeleteSubmissionAction";

const userDeleteSubmission = (
  ...path: SubmissionDocumentPath
): UserDeleteSubmissionAction => {
  return {
    type: USER_DELETE_SUBMISSION,
    payload: { path },
  };
};

export default userDeleteSubmission;

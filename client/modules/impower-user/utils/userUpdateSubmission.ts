import { SubmissionDocumentPath } from "../../impower-api";
import { SubmissionDocument } from "../../impower-data-store";
import {
  UserUpdateSubmissionAction,
  USER_UPDATE_SUBMISSION,
} from "../types/actions/userUpdateSubmissionAction";

const userUpdateSubmission = <T extends SubmissionDocument>(
  doc: T,
  ...path: SubmissionDocumentPath
): UserUpdateSubmissionAction => {
  return {
    type: USER_UPDATE_SUBMISSION,
    payload: { doc, path },
  };
};

export default userUpdateSubmission;

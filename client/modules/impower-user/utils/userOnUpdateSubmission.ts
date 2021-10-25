import { SubmissionDocumentPath } from "../../impower-api";
import { SubmissionDocument } from "../../impower-data-store";
import {
  UserUpdateSubmissionAction,
  USER_UPDATE_SUBMISSION,
} from "../types/actions/userUpdateSubmissionAction";

const userOnUpdateSubmission = <T extends SubmissionDocument>(
  onFinished: () => void,
  doc: T,
  ...path: SubmissionDocumentPath
): UserUpdateSubmissionAction => {
  return {
    type: USER_UPDATE_SUBMISSION,
    payload: { onFinished, doc, path },
  };
};

export default userOnUpdateSubmission;

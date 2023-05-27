import { SubmissionDocumentPath } from "../../impower-api";
import { SubmissionDocument } from "../../impower-data-store";
import {
  UserCreateSubmissionAction,
  USER_CREATE_SUBMISSION,
} from "../types/actions/userCreateSubmissionAction";

const userOnCreateSubmission = <T extends SubmissionDocument>(
  onFinished: () => void,
  doc: T,
  ...path: SubmissionDocumentPath
): UserCreateSubmissionAction => {
  return {
    type: USER_CREATE_SUBMISSION,
    payload: { onFinished, doc, path },
  };
};

export default userOnCreateSubmission;

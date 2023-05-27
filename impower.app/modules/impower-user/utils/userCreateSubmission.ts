import { SubmissionDocumentPath } from "../../impower-api";
import { SubmissionDocument } from "../../impower-data-store";
import {
  UserCreateSubmissionAction,
  USER_CREATE_SUBMISSION,
} from "../types/actions/userCreateSubmissionAction";

const userCreateSubmission = <T extends SubmissionDocument>(
  doc: T,
  ...path: SubmissionDocumentPath
): UserCreateSubmissionAction => {
  return {
    type: USER_CREATE_SUBMISSION,
    payload: { doc, path },
  };
};

export default userCreateSubmission;

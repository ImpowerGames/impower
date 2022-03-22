import {
  UserUpdateFileUploadStateAction,
  USER_UPDATE_FILE_UPLOAD_STATE,
} from "../types/actions/userUpdateFileUploadStateAction";

const userUpdateFileUploadState = (
  path: string,
  state:
    | "pending"
    | "running"
    | "paused"
    | "success"
    | "canceled"
    | "error"
    | "ready",
  bytesTransferred?: number
): UserUpdateFileUploadStateAction => {
  return {
    type: USER_UPDATE_FILE_UPLOAD_STATE,
    payload: { path, state, bytesTransferred },
  };
};

export default userUpdateFileUploadState;

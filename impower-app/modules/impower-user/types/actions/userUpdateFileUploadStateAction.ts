export const USER_UPDATE_FILE_UPLOAD_STATE =
  "@impower/user/USER_UPDATE_FILE_UPLOAD_STATE";
export interface UserUpdateFileUploadStateAction {
  type: typeof USER_UPDATE_FILE_UPLOAD_STATE;
  payload: {
    path: string;
    state:
      | "pending"
      | "running"
      | "paused"
      | "success"
      | "canceled"
      | "error"
      | "ready";
    bytesTransferred?: number;
  };
}

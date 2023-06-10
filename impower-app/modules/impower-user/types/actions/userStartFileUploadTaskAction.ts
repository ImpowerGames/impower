import { UploadTask } from "../../../impower-storage";

export const USER_START_FILE_UPLOAD_TASK =
  "impower/user/USER_START_FILE_UPLOAD_TASK";
export interface UserStartFileUploadTaskAction {
  type: typeof USER_START_FILE_UPLOAD_TASK;
  payload: { path: string; task: UploadTask };
}

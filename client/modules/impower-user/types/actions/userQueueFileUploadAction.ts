import { StorageFile } from "../../../impower-core";

export const USER_QUEUE_FILE_UPLOAD = "@impower/user/USER_QUEUE_FILE_UPLOAD";
export interface UserQueueFileUploadAction {
  type: typeof USER_QUEUE_FILE_UPLOAD;
  payload: {
    uploads: { path: string; file: File; metadata: StorageFile }[];
  };
}

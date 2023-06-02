import { StorageFile } from "../../impower-core";
import {
  UserQueueFileUploadAction,
  USER_QUEUE_FILE_UPLOAD,
} from "../types/actions/userQueueFileUploadAction";

const userQueueFileUpload = (
  ...uploads: { path: string; file: File; metadata: StorageFile }[]
): UserQueueFileUploadAction => {
  return {
    type: USER_QUEUE_FILE_UPLOAD,
    payload: { uploads },
  };
};

export default userQueueFileUpload;

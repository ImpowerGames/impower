import { UploadTask } from "../../impower-storage";
import {
  UserStartFileUploadTaskAction,
  USER_START_FILE_UPLOAD_TASK,
} from "../types/actions/userStartFileUploadTaskAction";

const userStartFileUploadTask = (
  path: string,
  task: UploadTask
): UserStartFileUploadTaskAction => {
  return {
    type: USER_START_FILE_UPLOAD_TASK,
    payload: { path, task },
  };
};

export default userStartFileUploadTask;

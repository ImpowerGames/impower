import { UserDocument } from "../../../impower-data-store";

export const USER_LOAD_USER_DOC = "@impower/user/USER_LOAD_USER_DOC";
export interface UserLoadUserDocAction {
  type: typeof USER_LOAD_USER_DOC;
  payload: {
    userDoc: UserDocument;
  };
}

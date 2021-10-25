import { UserDocument } from "../../impower-data-store";
import {
  UserLoadUserDocAction,
  USER_LOAD_USER_DOC,
} from "../types/actions/userLoadUserDocAction";

const userLoadUserDoc = (userDoc: UserDocument): UserLoadUserDocAction => {
  return {
    type: USER_LOAD_USER_DOC,
    payload: { userDoc },
  };
};

export default userLoadUserDoc;

import {
  UserSetTempUsernameAction,
  USER_SET_TEMP_USERNAME,
} from "../types/actions/userSetTempUsernameAction";

const userSetTempUsername = (
  tempUsername: string
): UserSetTempUsernameAction => {
  return {
    type: USER_SET_TEMP_USERNAME,
    payload: { tempUsername },
  };
};

export default userSetTempUsername;

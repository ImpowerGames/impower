import {
  UserSetTempEmailAction,
  USER_SET_TEMP_EMAIL,
} from "../types/actions/userSetTempEmailAction";

const userSetTempEmail = (tempEmail: string): UserSetTempEmailAction => {
  return {
    type: USER_SET_TEMP_EMAIL,
    payload: { tempEmail },
  };
};

export default userSetTempEmail;

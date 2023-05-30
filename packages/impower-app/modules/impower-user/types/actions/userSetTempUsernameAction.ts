export const USER_SET_TEMP_USERNAME = "@impower/user/SET_TEMP_USERNAME";
export interface UserSetTempUsernameAction {
  type: typeof USER_SET_TEMP_USERNAME;
  payload: {
    tempUsername: string;
  };
}

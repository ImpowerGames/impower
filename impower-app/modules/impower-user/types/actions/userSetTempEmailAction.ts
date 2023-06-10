export const USER_SET_TEMP_EMAIL = "impower/user/SET_TEMP_EMAIL";
export interface UserSetTempEmailAction {
  type: typeof USER_SET_TEMP_EMAIL;
  payload: {
    tempEmail: string;
  };
}

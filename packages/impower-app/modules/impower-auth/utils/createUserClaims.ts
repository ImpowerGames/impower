import { UserClaims } from "../types/interfaces/userClaims";

const createUserClaims = (): UserClaims => ({
  username: null,
  icon: null,
  dob: null,
  captcha_time: null,
  storage: null,
});

export default createUserClaims;

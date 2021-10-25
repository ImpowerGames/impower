import Auth from "../classes/auth";
import { User } from "../types/aliases";
import { UserClaims } from "../types/interfaces/userClaims";
import createUserClaims from "./createUserClaims";

const getUserClaims = async (user: User): Promise<UserClaims> => {
  if (user) {
    try {
      const token = await user.getIdTokenResult();
      Auth.instance.claims = { ...createUserClaims(), ...token.claims };
    } catch (e) {
      console.warn(e);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userObj = user as any;
      if (userObj?.reloadUserInfo?.customAttributes) {
        Auth.instance.claims = JSON.parse(
          userObj.reloadUserInfo.customAttributes
        );
      }
    }
    return Auth.instance.claims;
  }
  Auth.instance.claims = createUserClaims();
  return Auth.instance.claims;
};

export default getUserClaims;

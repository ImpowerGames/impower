import { getIdTokenResult } from "firebase/auth";
import Auth from "../classes/auth";
import { UserClaims } from "../types/interfaces/userClaims";
import createUserClaims from "./createUserClaims";

const getClaims = async (forceRefresh?: boolean): Promise<UserClaims> => {
  if (Auth.instance.internal.currentUser) {
    if (forceRefresh) {
      const logInfo = (await import("../../impower-logger/utils/logInfo"))
        .default;
      logInfo("Auth", "FORCE REFRESH CLAIMS");
    }
    const token = await getIdTokenResult(
      Auth.instance.internal.currentUser,
      forceRefresh
    );
    Auth.instance.claims = { ...createUserClaims(), ...token.claims };
    return Auth.instance.claims;
  }
  Auth.instance.claims = createUserClaims();
  return Auth.instance.claims;
};

export default getClaims;

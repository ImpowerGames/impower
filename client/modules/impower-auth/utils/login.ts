import { signInWithEmailAndPassword } from "firebase/auth";
import Auth from "../classes/auth";
import { UserCredential } from "../types/aliases";
import { UserClaims } from "../types/interfaces/userClaims";

const login = async (
  email: string,
  password: string,
  updateClaims?: () => Promise<UserClaims>
): Promise<UserCredential> => {
  const logInfo = (await import("../../impower-logger/utils/logInfo")).default;
  logInfo("Auth", "LOGGING IN WITH EMAIL", email);
  const credential = await signInWithEmailAndPassword(
    Auth.instance.internal,
    email,
    password
  );
  if (updateClaims) {
    Auth.instance.claims = await updateClaims();
  }
  return credential;
};

export default login;

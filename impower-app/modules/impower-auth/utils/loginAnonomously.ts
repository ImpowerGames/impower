import { signInAnonymously } from "firebase/auth";
import Auth from "../classes/auth";
import { UserCredential } from "../types/aliases";

const loginAnonymously = async (): Promise<UserCredential> => {
  const logInfo = (await import("../../impower-logger/utils/logInfo")).default;
  logInfo("Auth", "LOGGING IN ANONYMOUSLY");
  return signInAnonymously(Auth.instance.internal).then((credential) => {
    return credential;
  });
};

export default loginAnonymously;

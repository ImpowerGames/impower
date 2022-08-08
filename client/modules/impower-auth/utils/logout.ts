import { signOut } from "firebase/auth";
import Auth from "../classes/auth";

const logout = async (): Promise<void> => {
  const logInfo = (await import("../../impower-logger/utils/logInfo")).default;
  logInfo("Auth", "LOGGING OUT");
  await signOut(Auth.instance.internal);
  return new Promise((resolve) => {
    resolve();
  });
};

export default logout;

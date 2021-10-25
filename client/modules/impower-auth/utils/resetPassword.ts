import { confirmPasswordReset } from "firebase/auth";
import Auth from "../classes/auth";

const resetPassword = async (code: string, password: string): Promise<void> => {
  const logInfo = (await import("../../impower-logger/utils/logInfo")).default;
  logInfo("Auth", "RESETTING PASSWORD");
  return confirmPasswordReset(Auth.instance.internal, code, password);
};

export default resetPassword;

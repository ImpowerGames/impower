import { sendPasswordResetEmail } from "firebase/auth";
import Auth from "../classes/auth";
import getActionCodeSettings from "./getActionCodeSettings";

const forgotPassword = async (email: string): Promise<void> => {
  const logInfo = (await import("../../impower-logger/utils/logInfo")).default;
  logInfo("Auth", "SENT PASSWORD RESET EMAIL TO USER", email);
  return sendPasswordResetEmail(
    Auth.instance.internal,
    email,
    getActionCodeSettings({ email })
  );
};

export default forgotPassword;

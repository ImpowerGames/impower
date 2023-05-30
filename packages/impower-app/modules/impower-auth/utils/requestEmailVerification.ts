import { sendEmailVerification } from "firebase/auth";
import Auth from "../classes/auth";
import getActionCodeSettings from "./getActionCodeSettings";

const requestEmailVerification = async (): Promise<void> => {
  const { currentUser } = Auth.instance.internal;
  if (!currentUser) {
    throw new Error("User must be signed in to change their email");
  }
  const logInfo = (await import("../../impower-logger/utils/logInfo")).default;
  logInfo("Auth", "SENDING VERIFICATION EMAIL");
  const { email } = currentUser;
  return sendEmailVerification(currentUser, getActionCodeSettings({ email }));
};

export default requestEmailVerification;

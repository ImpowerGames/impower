import { sendSignInLinkToEmail } from "firebase/auth";
import Auth from "../classes/auth";
import getActionCodeSettings from "./getActionCodeSettings";

const sendLoginLinkToEmail = async (email: string): Promise<void> => {
  const logInfo = (await import("../../impower-logger/utils/logInfo")).default;
  logInfo("Auth", "SENDING LOGIN LINK TO EMAIL", email);
  return sendSignInLinkToEmail(
    Auth.instance.internal,
    email,
    getActionCodeSettings()
  );
};

export default sendLoginLinkToEmail;

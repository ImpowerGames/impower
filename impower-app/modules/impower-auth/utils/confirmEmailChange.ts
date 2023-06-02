import { applyActionCode } from "firebase/auth";
import Auth from "../classes/auth";

const confirmEmailChange = async (code: string): Promise<void> => {
  const logInfo = (await import("../../impower-logger/utils/logInfo")).default;
  logInfo("Auth", "CONFIRMING EMAIL CHANGE");
  return applyActionCode(Auth.instance.internal, code);
};

export default confirmEmailChange;

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
} from "firebase/auth";
import Auth from "../classes/auth";

const changeEmail = async (
  password: string,
  newEmail: string
): Promise<void> => {
  const logInfo = (await import("../../impower-logger/utils/logInfo")).default;
  logInfo("Auth", "UPDATING EMAIL");
  const user = Auth.instance.internal.currentUser;
  try {
    await updateEmail(user, newEmail);
  } catch {
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
    await updateEmail(user, newEmail);
  }
};

export default changeEmail;

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import Auth from "../classes/auth";

const changePassword = async (
  oldPassword: string,
  newPassword: string
): Promise<void> => {
  const logInfo = (await import("../../impower-logger/utils/logInfo")).default;
  logInfo("Auth", "UPDATING PASSWORD");
  const user = Auth.instance.internal.currentUser;
  try {
    await updatePassword(user, newPassword);
  } catch {
    const credential = EmailAuthProvider.credential(user.email, oldPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  }
};

export default changePassword;

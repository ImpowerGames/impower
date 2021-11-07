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
    const emailCredential = EmailAuthProvider.credential(user.email, password);
    const userCredential = await reauthenticateWithCredential(
      user,
      emailCredential
    );
    await updateEmail(userCredential.user, newEmail);
  }
};

export default changeEmail;

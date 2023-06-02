import {
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import Auth from "../classes/auth";

const deleteCurrentUser = async (password: string): Promise<void> => {
  const user = Auth.instance.internal.currentUser;
  if (user) {
    try {
      await deleteUser(user);
    } catch {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      await deleteUser(user);
    }
  }
};

export default deleteCurrentUser;

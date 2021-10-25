import { deleteUser } from "firebase/auth";
import Auth from "../classes/auth";

const deleteCurrentUser = async (): Promise<void> => {
  if (Auth.instance.internal.currentUser) {
    await deleteUser(Auth.instance.internal.currentUser);
  }
};

export default deleteCurrentUser;

import {
  deleteUser,
  signInAnonymously,
  signInWithEmailLink,
  UserCredential,
} from "firebase/auth";
import Auth from "../classes/auth";

const loginWithLink = async (
  email: string,
  link: string
): Promise<UserCredential> => {
  const logInfo = (await import("../../impower-logger/utils/logInfo")).default;
  logInfo("Auth", "LOGGING IN WITH LINK", email);
  let deletedAnonymousUser = false;
  if (Auth.instance.internal.currentUser?.isAnonymous) {
    await deleteUser(Auth.instance.internal.currentUser);
    deletedAnonymousUser = true;
  }
  return signInWithEmailLink(Auth.instance.internal, email, link)
    .catch((error) => {
      if (deletedAnonymousUser) {
        return signInAnonymously(Auth.instance.internal).then(() => {
          throw error;
        });
      }
      throw error;
    })
    .then((credential) => {
      return credential;
    });
};

export default loginWithLink;

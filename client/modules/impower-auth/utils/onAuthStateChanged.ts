import { onAuthStateChanged as _onAuthStateChanged } from "firebase/auth";
import Auth from "../classes/auth";
import { AuthError, NextOrObserver, Unsubscribe, User } from "../types/aliases";

const onAuthStateChanged = (
  nextOrObserver: NextOrObserver<User>,
  error?: (a: AuthError) => unknown,
  completed?: Unsubscribe
): Unsubscribe => {
  return _onAuthStateChanged(
    Auth.instance.internal,
    nextOrObserver,
    error,
    completed
  );
};

export default onAuthStateChanged;

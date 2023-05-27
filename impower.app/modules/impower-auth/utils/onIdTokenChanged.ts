import { onIdTokenChanged as _onIdTokenChanged } from "firebase/auth";
import Auth from "../classes/auth";
import { AuthError, NextOrObserver, Unsubscribe, User } from "../types/aliases";

const onIdTokenChanged = (
  nextOrObserver: NextOrObserver<User>,
  error?: (a: AuthError) => unknown,
  completed?: Unsubscribe
): Unsubscribe => {
  return _onIdTokenChanged(
    Auth.instance.internal,
    nextOrObserver,
    error,
    completed
  );
};

export default onIdTokenChanged;

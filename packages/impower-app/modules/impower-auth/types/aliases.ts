import {
  Auth as _Auth,
  User as _User,
  UserCredential as _UserCredential,
  ActionCodeSettings as _ActionCodeSettings,
  NextOrObserver as _NextOrObserver,
} from "firebase/auth";

export type InternalAuth = _Auth;

export type UserCredential = _UserCredential;

export type User = _User;

export type ActionCodeSettings = _ActionCodeSettings;

export type NextOrObserver<User> = _NextOrObserver<User>;

export type Unsubscribe = () => void;

export type AuthErrorCode =
  | "auth/user-not-found"
  | "auth/wrong-password"
  | "auth/invalid-email"
  | "auth/invalid-display-name"
  | "auth/invalid-password"
  | "auth/email-already-exists"
  | "auth/weak-password"
  | "auth/invalid-verification-code"
  | "auth/too-many-requests";

export declare interface Persistence {
  /**
   * Type of Persistence.
   * - 'SESSION' is used for temporary persistence such as `sessionStorage`.
   * - 'LOCAL' is used for long term persistence such as `localStorage` or `IndexedDB`.
   * - 'NONE' is used for in-memory, or no persistence.
   */
  readonly type: "SESSION" | "LOCAL" | "NONE";
}

export interface AuthError {
  code: AuthErrorCode;
  message: string;
  name: string;
}

export enum ActionCodeMode {
  resetPassword = "resetPassword",
  recoverEmail = "recoverEmail",
  verifyEmail = "verifyEmail",
}

import {
  Database,
  DataSnapshot as _DataSnapshot,
  Query as _Query,
  QueryConstraint as _QueryConstraint,
  QueryConstraintType as _QueryConstraintType,
  Unsubscribe as _Unsubscribe,
} from "firebase/database";

export type InternalDataState = Database;

export type DataSnapshot = _DataSnapshot;
export type Query = _Query;
export type Unsubscribe = _Unsubscribe;
export type QueryConstraintType = _QueryConstraintType;
export type QueryConstraint = _QueryConstraint;

export interface ListenOptions {
  /** Whether to remove the listener after its first invocation. */
  readonly onlyOnce?: boolean;
}

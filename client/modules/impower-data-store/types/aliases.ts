import {
  CollectionReference as _CollectionReference,
  DocumentData as _DocumentData,
  documentId as _documentId,
  DocumentReference as _DocumentReference,
  DocumentSnapshot as _DocumentSnapshot,
  FieldPath as _FieldPath,
  FieldValue as _FieldValue,
  Firestore,
  increment as _increment,
  Query as _Query,
  QueryConstraint as _QueryConstraint,
  QueryConstraintType as _QueryConstraintType,
  QueryDocumentSnapshot as _QueryDocumentSnapshot,
  QuerySnapshot as _QuerySnapshot,
  serverTimestamp as _serverTimestamp,
  UpdateData as _UpdateData,
  WriteBatch as _WriteBatch,
} from "firebase/firestore/lite";

export type InternalDataStore = Firestore;

export type DocumentData = _DocumentData;

export type CollectionReference<T extends DocumentData = DocumentData> =
  _CollectionReference<T>;

export type DocumentReference<T extends DocumentData = DocumentData> =
  _DocumentReference<T>;

export type QuerySnapshot<T extends DocumentData = DocumentData> =
  _QuerySnapshot<T>;

export type QueryDocumentSnapshot<T extends DocumentData = DocumentData> =
  _QueryDocumentSnapshot<T>;

export type DocumentSnapshot<T extends DocumentData = DocumentData> =
  _DocumentSnapshot<T>;

export type Query<T extends DocumentData = DocumentData> = _Query<T>;

export type QueryConstraintType = _QueryConstraintType;

export type QueryConstraint = _QueryConstraint;

export type WriteBatch = _WriteBatch;

export type UpdateData<T> = _UpdateData<T>;

export type FieldPath = _FieldPath;

export type FieldValue = _FieldValue;

export const documentIdServerValue = (): FieldPath => _documentId();

export const timestampServerValue = (): FieldValue => _serverTimestamp();

export const incrementServerValue = (n: number): FieldValue => _increment(n);

export const isFieldValue = (obj: unknown): obj is FieldValue => {
  if (!obj) {
    return false;
  }
  const fieldValue = obj as FieldValue;
  return (
    // eslint-disable-next-line dot-notation
    fieldValue["h_"] !== undefined || fieldValue["_delegate"] !== undefined
  );
};

export interface QueryOptions {
  fieldPath: string | FieldPath;
  opStr: WhereFilterOp;
  value: unknown;
}

export interface SetOptions {
  readonly merge?: boolean;
}

export type DataStoreErrorCode =
  | "cancelled"
  | "unknown"
  | "invalid-argument"
  | "deadline-exceeded"
  | "not-found"
  | "already-exists"
  | "permission-denied"
  | "resource-exhausted"
  | "failed-precondition"
  | "aborted"
  | "out-of-range"
  | "unimplemented"
  | "internal"
  | "unavailable"
  | "data-loss"
  | "unauthenticated"
  | "size-limit-exceeded";

export type WhereFilterOp =
  | "<"
  | "<="
  | "=="
  | "!="
  | ">="
  | ">"
  | "array-contains"
  | "in"
  | "array-contains-any"
  | "not-in";

export interface DataStoreError {
  code: DataStoreErrorCode;
  message: string;
  name: string;
  stack?: string;
}

export const isDocumentSnapshot = (obj: unknown): obj is DocumentSnapshot => {
  if (!obj) {
    return false;
  }
  const snapshot = obj as DocumentSnapshot;
  return snapshot.data !== undefined;
};

export const isQuerySnapshot = (obj: unknown): obj is QuerySnapshot => {
  if (!obj) {
    return false;
  }
  const snapshot = obj as QuerySnapshot;
  return snapshot.docs !== undefined;
};

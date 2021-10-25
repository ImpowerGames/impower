import * as firebase from "@firebase/rules-unit-testing";
import * as firebaseAdmin from "firebase-admin";
import {
  MY_ID,
  AuthorAttributes,
  SubmissionType,
  AuthClaims,
  MY_VALID_AUTH,
} from "../constants";
import { getAdmin, getAuthor, getClient } from "../utils";

export const getAdminServerTimestamp = () =>
  firebaseAdmin.firestore.FieldValue.serverTimestamp();

export const getAdminServerIncrement = (n: number) =>
  firebaseAdmin.firestore.FieldValue.increment(n);

export const getClientServerTimestamp = () =>
  firebase.firestore.FieldValue.serverTimestamp();

export const getClientServerIncrement = (n: number) =>
  firebase.firestore.FieldValue.increment(n);

export const getToday = (currentDate: Date): number => {
  return Math.trunc(currentDate.getTime() / 1000 / 60 / 60 / 24);
};

export const getCreateMetadata = (
  auth?: AuthClaims,
  admin?: boolean,
  initialCounter = 1
): {
  _author?: AuthorAttributes;
  _createdBy?: string;
  _updatedBy?: string;
  _createdAt: unknown;
  _updatedAt: unknown;
  _updates: { [day: string]: unknown };
} => {
  const currentDate = new Date();
  const today = getToday(currentDate);
  return {
    _author: getAuthor(auth),
    _createdBy: auth?.uid || null,
    _updatedBy: auth?.uid || null,
    _createdAt: admin ? getAdminServerTimestamp() : getClientServerTimestamp(),
    _updatedAt: admin ? getAdminServerTimestamp() : getClientServerTimestamp(),
    _updates: {
      [`${today}`]: admin
        ? getAdminServerIncrement(initialCounter)
        : getClientServerIncrement(1),
    },
  };
};

export const getUpdateMetadata = (
  auth?: AuthClaims,
  admin?: boolean,
  initialCounter = 1
): {
  _author?: AuthorAttributes;
  _createdBy?: string;
  _updatedBy?: string;
  _updatedAt: unknown;
  [_updates_day: string]: unknown;
} => {
  const currentDate = new Date();
  const today = getToday(currentDate);
  return {
    _author: getAuthor(auth),
    _updatedBy: auth?.uid || null,
    _updatedAt: admin ? getAdminServerTimestamp() : getClientServerTimestamp(),
    [`_updates.${today}`]: admin
      ? getAdminServerIncrement(initialCounter)
      : getClientServerIncrement(1),
  };
};

export const getSubmissionType = (
  ref: string | FirebaseFirestore.CollectionReference
): SubmissionType => {
  const path = typeof ref === "string" ? ref : ref.path;
  const colSegs = path.split("/");
  const type = colSegs[colSegs.length - 1] as SubmissionType;
  return type;
};

export const setupSubmissionCounter = async (
  submissionType: SubmissionType,
  initialCounter = 1
) => {
  const admin = getAdmin();
  await admin
    .firestore()
    .collection("users")
    .doc(MY_ID)
    .collection("submissions")
    .doc(submissionType)
    .set({
      _documentType: "PathDocument",
      ...getCreateMetadata(MY_VALID_AUTH, true, initialCounter),
    });
};

export const getCollectionRef = (client, collectionPath: string) => {
  return client.firestore().collection(collectionPath);
};

export const getDocRef = (client, collectionPath: string, docId?: string) => {
  return client.firestore().collection(collectionPath).doc(docId);
};

export const getSubmissionCollectionRef = (
  client,
  collectionPath: string,
  submissionType: SubmissionType
) => {
  return submissionType === "studios" ||
    submissionType === "resources" ||
    submissionType === "games" ||
    submissionType === "phrases"
    ? client.firestore().collection(collectionPath)
    : client
        .firestore()
        .collection(collectionPath)
        .doc()
        .collection(submissionType);
};

export const getSubmissionDocRef = (
  client,
  collection: string,
  submissionType: SubmissionType,
  docId?: string,
  childId?: string
) => {
  if (
    submissionType === "contributions" ||
    submissionType === "comments" ||
    submissionType === "reports" ||
    submissionType === "suggestions"
  ) {
    const ref = client.firestore().collection(collection).doc(docId);
    return ref.collection(submissionType).doc(childId || MY_ID);
  }
  return client.firestore().collection(collection).doc(docId);
};

export const getDoc = async (
  auth: AuthClaims,
  collectionPath: string,
  docId?: string
): Promise<void> => {
  const client = getClient(auth);
  const ref = getDocRef(client, collectionPath, docId);
  await ref.get();
};

export const listDocs = async (
  auth: AuthClaims,
  collectionPath: string,
  limit?: number
): Promise<void> => {
  const client = getClient(auth);
  const ref = getCollectionRef(client, collectionPath);
  if (limit > 0) {
    await ref.limit(limit).get();
  } else {
    await ref.get();
  }
};

export const createDoc = async (
  auth: AuthClaims,
  collectionPath: string,
  doc: FirebaseFirestore.DocumentData,
  docId?: string
): Promise<void> => {
  const client = getClient(auth);
  const ref = getDocRef(client, collectionPath, docId);
  await ref.set(doc);
};

export const updateDoc = async (
  auth: AuthClaims,
  collectionPath: string,
  doc?: FirebaseFirestore.DocumentData,
  docId?: string
): Promise<void> => {
  const client = getClient(auth);
  const admin = getAdmin();
  const ref = getDocRef(client, collectionPath, docId);
  await admin
    .firestore()
    .doc(ref.path)
    .set({
      ...getCreateMetadata(MY_VALID_AUTH, true),
    });
  await ref.update(doc || { ...getUpdateMetadata(MY_VALID_AUTH) });
};

export const deleteDoc = async (
  auth: AuthClaims,
  collectionPath: string,
  docId?: string
): Promise<void> => {
  const client = getClient(auth);
  const ref = getDocRef(client, collectionPath, docId);
  await ref.delete();
};

export const getSubmissionDoc = async (
  auth: AuthClaims,
  collection: string,
  submissionType: SubmissionType,
  docId?: string,
  childId?: string
): Promise<void> => {
  const client = getClient(auth);
  const ref = getSubmissionDocRef(
    client,
    collection,
    submissionType,
    docId,
    childId
  );
  await ref.get();
};

export const listSubmissionDocs = async (
  auth: AuthClaims,
  collection: string,
  submissionType: SubmissionType,
  limit?: number
): Promise<void> => {
  const client = getClient(auth);
  const ref = getSubmissionCollectionRef(client, collection, submissionType);
  if (limit > 0) {
    await ref.limit(limit).get();
  } else {
    await ref.get();
  }
};

export const createSubmissionDoc = async (
  auth: AuthClaims,
  collectionPath: string,
  submissionType: SubmissionType,
  doc: FirebaseFirestore.DocumentData,
  docId?: string,
  childId?: string
): Promise<void> => {
  const client = getClient(auth);
  const submissionRef = client
    .firestore()
    .collection("users")
    .doc(MY_ID)
    .collection("submissions")
    .doc(submissionType);
  const ref = getSubmissionDocRef(
    client,
    collectionPath,
    submissionType,
    docId,
    childId
  );
  const path = ref?.path;
  const batch = client.firestore().batch();
  batch.update(submissionRef, {
    ...getUpdateMetadata(MY_VALID_AUTH),
    path,
  });
  batch.set(ref, doc);
  await batch.commit();
};

export const updateSubmissionDoc = async (
  auth: AuthClaims,
  collection: string,
  submissionType: SubmissionType,
  doc?: FirebaseFirestore.DocumentData,
  docId?: string,
  childId?: string
): Promise<void> => {
  const client = getClient(auth);
  const admin = getAdmin();
  const ref = getSubmissionDocRef(
    client,
    collection,
    submissionType,
    docId,
    childId
  );
  await admin
    .firestore()
    .doc(ref.path)
    .set({
      ...getCreateMetadata(MY_VALID_AUTH, true),
    });
  await ref.update(doc || { ...getUpdateMetadata(MY_VALID_AUTH) });
};

export const deleteSubmissionDoc = async (
  auth: AuthClaims,
  collection: string,
  submissionType: SubmissionType,
  docId?: string,
  childId?: string
): Promise<void> => {
  const client = getClient(auth);
  const ref = getSubmissionDocRef(
    client,
    collection,
    submissionType,
    docId,
    childId
  );
  await ref.delete();
};

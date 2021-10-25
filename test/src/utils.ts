import * as firebase from "@firebase/rules-unit-testing";
import {
  AuthClaims,
  DATABASE_NAME,
  PROJECT_ID,
  STORAGE_BUCKET,
} from "./constants";

export const getAdmin = () => {
  return firebase.initializeAdminApp({
    projectId: PROJECT_ID,
    databaseName: DATABASE_NAME,
    storageBucket: STORAGE_BUCKET,
  });
};

export const getClient = (auth?: AuthClaims) => {
  return firebase.initializeTestApp({
    projectId: PROJECT_ID,
    databaseName: DATABASE_NAME,
    storageBucket: STORAGE_BUCKET,
    auth,
  });
};

export const getAuthor = (
  auth?: AuthClaims
): {
  u: string;
  i: string;
  h: string;
} => {
  return {
    u: auth?.username || null,
    i: auth?.icon || null,
    h: auth?.hex || null,
  };
};

export const clearBefore = async () => {
  const admin = getAdmin();
  await admin.storage().bucket().deleteFiles({ prefix: "users/" });
  await admin.database().ref().child("users").remove();
  await admin.database().ref().child("studios").remove();
  await admin.database().ref().child("published_studios").remove();
  await admin.database().ref().child("resources").remove();
  await admin.database().ref().child("published_resources").remove();
  await admin.database().ref().child("pitched_resources").remove();
  await admin.database().ref().child("games").remove();
  await admin.database().ref().child("published_games").remove();
  await admin.database().ref().child("pitched_games").remove();
  await admin.database().ref().child("messages").remove();
  await firebase.clearFirestoreData({ projectId: PROJECT_ID });
  await Promise.all(firebase.apps().map((app) => app.delete()));
};

export const clearBeforeEach = async () => {
  const admin = getAdmin();
  await admin.storage().bucket().deleteFiles({ prefix: "users/" });
  await admin.database().ref().child("phrases").remove();
  await admin.database().ref().child("tags").remove();
  await admin.database().ref().child("users").remove();
  await admin.database().ref().child("studios").remove();
  await admin.database().ref().child("published_studios").remove();
  await admin.database().ref().child("resources").remove();
  await admin.database().ref().child("published_resources").remove();
  await admin.database().ref().child("pitched_resources").remove();
  await admin.database().ref().child("games").remove();
  await admin.database().ref().child("published_games").remove();
  await admin.database().ref().child("pitched_games").remove();
  await admin.database().ref().child("messages").remove();
  await firebase.clearFirestoreData({ projectId: PROJECT_ID });
  await Promise.all(firebase.apps().map((app) => app.delete()));
};

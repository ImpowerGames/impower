import * as firebase from "@firebase/rules-unit-testing";
import * as firebaseAdmin from "firebase-admin";

export const getAdminServerTimestamp = () =>
  firebaseAdmin.database.ServerValue.TIMESTAMP;

export const getAdminServerIncrement = (n: number) =>
  firebaseAdmin.database.ServerValue.increment(n);

export const getClientServerTimestamp = () =>
  firebase.database.ServerValue.TIMESTAMP;

export const getClientServerIncrement = (n: number) =>
  firebase.database.ServerValue.increment(n);

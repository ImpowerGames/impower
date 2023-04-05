/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { App } from "firebase-admin/app";

if (process.env.NEXT_PUBLIC_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `${
    process.env.NEXT_PUBLIC_EMULATOR_HOST
  }:${9099}`;
  process.env.FIRESTORE_EMULATOR_HOST = `${
    process.env.NEXT_PUBLIC_EMULATOR_HOST
  }:${8080}`;
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = `${
    process.env.NEXT_PUBLIC_EMULATOR_HOST
  }:${9000}`;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = `${
    process.env.NEXT_PUBLIC_EMULATOR_HOST
  }:${9199}`;
}

export const initAdminApp = async () => {
  const { getApp, initializeApp, cert } = await import("firebase-admin/app");
  try {
    const app = getApp();
    if (app) {
      return app;
    }
  } catch {
    // NoOp
  }
  if (process.env.NEXT_PUBLIC_EMULATOR_HOST) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = `${
      process.env.NEXT_PUBLIC_EMULATOR_HOST
    }:${9099}`;
    process.env.FIRESTORE_EMULATOR_HOST = `${
      process.env.NEXT_PUBLIC_EMULATOR_HOST
    }:${8080}`;
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = `${
      process.env.NEXT_PUBLIC_EMULATOR_HOST
    }:${9000}`;
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = `${
      process.env.NEXT_PUBLIC_EMULATOR_HOST
    }:${9199}`;
    return initializeApp({
      projectId: "impowergames-dev",
      storageBucket: "default-bucket",
      databaseURL: "https://impowergames-dev.firebase.io",
    });
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    throw new Error("No service account key specified");
  }
  const adminCredentials = {
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  };
  return initializeApp(adminCredentials);
};

export const getAdminAuth = async (app: App) => {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(app);
};

export const getAdminFirestore = async (app: App) => {
  const { getFirestore } = await import("firebase-admin/firestore");
  return getFirestore(app);
};

export const getAdminDatabase = async (app: App) => {
  const { getDatabase } = await import("firebase-admin/database");
  return getDatabase(app);
};

export const getAdminStorage = async (app: App) => {
  const { getStorage } = await import("firebase-admin/storage");
  return getStorage(app);
};

export const getAdminRemoteConfig = async (app: App) => {
  const { getRemoteConfig } = await import("firebase-admin/remote-config");
  return getRemoteConfig(app);
};

export const getAdminAppCheck = async (app: App) => {
  const { getAppCheck } = await import("firebase-admin/app-check");
  return getAppCheck(app);
};

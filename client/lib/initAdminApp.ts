if (process.env.NEXT_PUBLIC_ORIGIN?.includes("localhost")) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
  process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = "localhost:9000";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = "localhost:9199";
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const initAdminApp = async () => {
  const admin = await import("firebase-admin");
  const existingApp = admin.apps[0];
  if (existingApp) {
    return existingApp;
  }
  if (process.env.NEXT_PUBLIC_ORIGIN?.includes("localhost")) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
    process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = "localhost:9000";
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = "localhost:9199";
    return admin.initializeApp({
      projectId: "impowergames-dev",
      storageBucket: "default-bucket",
      databaseURL: "https://impowergames-dev.firebase.io",
    });
  }
  const adminCredentials = {
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    ),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  };
  return admin.initializeApp(adminCredentials);
};

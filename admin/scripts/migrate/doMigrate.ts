import * as admin from "firebase-admin";
import { ServiceAccount } from "firebase-admin";

export interface HashParams {
  algorithm: admin.auth.HashAlgorithmType;
  base64_signer_key: string;
  base64_salt_separator: string;
  rounds: number;
  mem_cost: number;
}

export interface UserAccounts {
  users: {
    localId: string;
    email: string;
    emailVerified: boolean;
    displayName: string;
    disabled?: boolean;
    customAttributes: string;
    providerUserInfo: admin.auth.UserProviderRequest[];
    passwordHash: string;
    salt: string;
  }[];
}

export const doMigrate = async (
  fromAccounts: UserAccounts,
  fromAuth: HashParams,
  fromCredentials: ServiceAccount,
  fromDatabaseURL: string,
  fromStorageBucket: string,
  toCredentials: ServiceAccount,
  toDatabaseURL: string,
  toStorageBucket: string
) => {
  console.log("Initializing FROM app");
  const fromApp = admin.initializeApp(
    {
      credential: admin.credential.cert(fromCredentials),
      databaseURL: fromDatabaseURL,
      storageBucket: fromStorageBucket,
    },
    "from"
  );
  console.log("Initializing TO app");
  const toApp = admin.initializeApp(
    {
      credential: admin.credential.cert(toCredentials),
      databaseURL: toDatabaseURL,
      storageBucket: toStorageBucket,
    },
    "to"
  );

  // Migrate all users
  console.log("Processing all users");
  const userImportRecords: admin.auth.UserImportRecord[] = [];
  let i = 0;
  while (i < fromAccounts.users.length) {
    const r = fromAccounts.users[i];
    const existingUser = await toApp
      .auth()
      .getUserByEmail(r.email)
      .catch(() => null);
    if (!existingUser && r.passwordHash) {
      userImportRecords.push({
        uid: r.localId,
        email: r.email,
        emailVerified: r.emailVerified,
        displayName: r.displayName,
        disabled: r.disabled,
        providerData: r.providerUserInfo,
        customClaims: JSON.parse(r.customAttributes || "{}"),
        passwordHash: Buffer.from(r.passwordHash, "base64"),
        passwordSalt: Buffer.from(r.salt, "base64"),
      });
    }
    i += 1;
  }
  console.log("Processing auth hash");
  // All the parameters below can be obtained from the Firebase Console's users section.
  const options = {
    hash: {
      algorithm: fromAuth.algorithm,
      key: Buffer.from(fromAuth.base64_signer_key, "base64"),
      saltSeparator: Buffer.from(fromAuth.base64_salt_separator, "base64"),
      rounds: fromAuth.rounds,
      memoryCost: fromAuth.mem_cost,
    },
  };
  console.log("Migrating all users");
  await toApp.auth().importUsers(userImportRecords, options);

  // Migrate all storage data
  console.log("Migrating all storage data");
  const [publicFiles] = await fromApp.storage().bucket().getFiles({
    prefix: `public`,
  });
  await Promise.all(publicFiles.map(async (f) => {
    const [downloadedFile] = await f.download();
    const [metadata] = await f.getMetadata();
    const customMetadata = metadata.metadata;
    const contentType = metadata.contentType;
    const options = {
      contentType,
      "public": true,
      "Cache-Control": "public,max-age=31536000",
      "metadata": {
        "metadata": {
          ...customMetadata
        }
      },
    };
    await toApp.storage().bucket().file(f.name).save(downloadedFile, options)
  }
  ));
  const [userFiles] = await fromApp.storage().bucket().getFiles({
    prefix: `users`,
  });
  await Promise.all(userFiles.map(async (f) => {
    const [downloadedFile] = await f.download();
    const [metadata] = await f.getMetadata();
    const customMetadata = metadata.metadata;
    const contentType = metadata.contentType;
    const options = {
      contentType,
      "metadata": {
        "metadata": {
          ...customMetadata
        }
      },
    };
    await toApp.storage().bucket().file(f.name).save(downloadedFile, options)
  }));

  // Migrate all database data
  console.log("Migrating all database data");
  const fromDatabaseRootSnap = await fromApp.database().ref().get();
  await toApp.database().ref().set(fromDatabaseRootSnap.val());

  // Migrate all firestore data
  console.log("Migrating all firestore data");
  const toBulkWriter = toApp.firestore().bulkWriter();
  const fromCollections = await fromApp.firestore().listCollections();
  const migrateCollection = async (collection: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>) => {
    const colSnap = await collection.get();
    return await Promise.all(colSnap.docs.map((docSnap) => 
      toBulkWriter.set(toApp.firestore().doc(docSnap.ref.path), docSnap.data())
    ));
  }
  await Promise.all(fromCollections.map(collection => migrateCollection(collection)));
  await toBulkWriter.close();
};

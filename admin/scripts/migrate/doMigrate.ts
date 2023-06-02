import {
  cert,
  getApp,
  initializeApp,
  ServiceAccount,
} from "firebase-admin/app";
import {
  getAuth,
  HashAlgorithmType,
  UserImportRecord,
  UserProviderRequest,
} from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export interface HashParams {
  algorithm: HashAlgorithmType;
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
    providerUserInfo: UserProviderRequest[];
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
  const fromApp =
    getApp("from") ||
    initializeApp(
      {
        credential: cert(fromCredentials),
        databaseURL: fromDatabaseURL,
        storageBucket: fromStorageBucket,
      },
      "from"
    );
  console.log("Initializing TO app");
  const toApp =
    getApp("to") ||
    initializeApp(
      {
        credential: cert(toCredentials),
        databaseURL: toDatabaseURL,
        storageBucket: toStorageBucket,
      },
      "to"
    );

  // Migrate all users
  console.log("Processing all users");
  const userImportRecords: UserImportRecord[] = [];
  let i = 0;
  while (i < fromAccounts.users.length) {
    const r = fromAccounts.users[i];
    if (r) {
      const existingUser = await getAuth(toApp)
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
  await getAuth(toApp).importUsers(userImportRecords, options);

  // Migrate all storage data
  console.log("Migrating all storage data");
  const [publicFiles] = await getStorage(fromApp).bucket().getFiles({
    prefix: `public`,
  });
  await Promise.all(
    publicFiles.map(async (f) => {
      const [downloadedFile] = await f.download();
      const [metadata] = await f.getMetadata();
      const customMetadata = metadata.metadata;
      const contentType = metadata.contentType;
      const options = {
        contentType,
        public: true,
        "Cache-Control": "public,max-age=31536000",
        metadata: {
          metadata: {
            ...customMetadata,
          },
        },
      };
      await getStorage(toApp)
        .bucket()
        .file(f.name)
        .save(downloadedFile, options);
    })
  );
  const [userFiles] = await getStorage(fromApp).bucket().getFiles({
    prefix: `users`,
  });
  await Promise.all(
    userFiles.map(async (f) => {
      const [downloadedFile] = await f.download();
      const [metadata] = await f.getMetadata();
      const customMetadata = metadata.metadata;
      const contentType = metadata.contentType;
      const options = {
        contentType,
        metadata: {
          metadata: {
            ...customMetadata,
          },
        },
      };
      await getStorage(toApp)
        .bucket()
        .file(f.name)
        .save(downloadedFile, options);
    })
  );

  // Migrate all database data
  console.log("Migrating all database data");
  const fromDatabaseRootSnap = await getDatabase(fromApp).ref().get();
  await getDatabase(toApp).ref().set(fromDatabaseRootSnap.val());

  // Migrate all firestore data
  console.log("Migrating all firestore data");
  const toBulkWriter = getFirestore(toApp).bulkWriter();
  const fromCollections = await getFirestore(fromApp).listCollections();
  const migrateCollection = async (
    collection: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>
  ) => {
    const colSnap = await collection.get();
    const colPromises = colSnap.docs.map(async (docSnap) => {
      const fromChildCollections = await docSnap.ref.listCollections();
      const fromChildColPromises = fromChildCollections.map(
        async (childColRef) => {
          const childColSnap = await childColRef.get();
          const childColDocPromises = childColSnap.docs.map(
            async (childDocSnap) => {
              return await toBulkWriter.set(
                getFirestore(toApp).doc(childDocSnap.ref.path),
                childDocSnap.data(),
                { merge: true }
              );
            }
          );
          const childColDocResults = await Promise.all(childColDocPromises);
          return childColDocResults;
        }
      );
      const fromDocPromise = toBulkWriter.set(
        getFirestore(toApp).doc(docSnap.ref.path),
        docSnap.data(),
        { merge: true }
      );
      const docResult = await fromDocPromise;
      const colResults = await Promise.all(fromChildColPromises);
      const colFlatResults = colResults.flatMap((x) => x);
      const results = [docResult, ...colFlatResults];
      return results;
    });
    const colResults = await Promise.all(colPromises);
    const colFlatResults = colResults.flatMap((x) => x);
    return colFlatResults;
  };
  await Promise.all(
    fromCollections.map((collection) => migrateCollection(collection))
  );
  await toBulkWriter.close();
};

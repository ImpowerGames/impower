import * as admin from "firebase-admin";
import { ServiceAccount } from "firebase-admin";

export const doWipe = async (
  credentials: ServiceAccount,
  databaseURL: string,
  storageBucket: string
) => {
  console.log("Initializing TO app");
  const adminApp = admin.initializeApp(
    {
      credential: admin.credential.cert(credentials),
      databaseURL,storageBucket
    },
    "to"
  );
  const auth = adminApp.auth();
  const firestore = adminApp.firestore();
  const database = adminApp.database();
  const storage = adminApp.storage();
  
  // Delete all users
  console.log("Deleting all users");
  const deleteAllUsers = (nextPageToken?) => {
    auth
      .listUsers(1000, nextPageToken)
      .then((listUsersResult) => {
        auth.deleteUsers(listUsersResult.users.map(x => x.uid));
        if (listUsersResult.pageToken) {
          deleteAllUsers(listUsersResult.pageToken);
        }
      })
      .catch((error) => {
        console.log('Error listing users:', error);
      });
  };
  await deleteAllUsers();

  // Delete all storage data
  console.log("Deleting all storage data");
  try {
    await storage.bucket().deleteFiles({
      prefix: `public`,
    });
  } catch {
    // no folder to delete
  }
  try {
    await storage.bucket().deleteFiles({
      prefix: `users`,
    });
  } catch {
    // no folder to delete
  }

  // Delete all database data
  console.log("Deleting all database data");
  await database.ref().remove();
  
  // Delete all firestore data
  console.log("Deleting all firestore data");
  const bulkWriter = firestore.bulkWriter();
  const collections = await firestore.listCollections();
  await Promise.all(collections.map((collection) => 
    firestore.recursiveDelete(collection, bulkWriter)
  ));
  await bulkWriter.close();
};

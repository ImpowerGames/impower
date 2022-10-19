import * as admin from "firebase-admin";
import { ServiceAccount } from "firebase-admin";

export const doCleanup = async (
  credentials: ServiceAccount,
  databaseURL: string
) => {
  const adminApp = admin.initializeApp(
    {
      credential: admin.credential.cert(credentials),
      databaseURL,
    },
    "to"
  );
  const firestore = adminApp.firestore();
  const database = adminApp.database();
  const bulkWriter = firestore.bulkWriter();
  // Delete all games/{id}
  const gameSnaps = await firestore.collection("games").get();
  gameSnaps.forEach((s) => {
    if (s.exists) {
      bulkWriter.delete(firestore.collection("games").doc(s.id));
    }
  });
  // Delete all pitched_games/{id}
  const pitchedGameSnaps = await firestore.collection("pitched_games").get();
  pitchedGameSnaps.forEach((s) => {
    if (s.exists) {
      bulkWriter.delete(firestore.collection("pitched_games").doc(s.id));
    }
  });
  // Delete all pitched_games/{id}/contributions/{contributionId}
  const contributionSnaps = await firestore
    .collectionGroup("contributions")
    .get();
  contributionSnaps.forEach((s) => {
    if (s.exists && s.ref.parent.parent) {
      bulkWriter.delete(
        firestore
          .collection("pitched_games")
          .doc(s.ref.parent.parent.id)
          .collection("contributions")
          .doc(s.id),
        s.data()
      );
    }
  });
  // Delete all users/{id}/deleted_submissions/{submissionKey}
  const deletedSubmissionSnaps = await firestore
    .collectionGroup("deleted_submissions")
    .get();
  deletedSubmissionSnaps.forEach((s) => {
    if (s.exists && s.ref.parent.parent) {
      bulkWriter.delete(
        firestore
          .collection("users")
          .doc(s.ref.parent.parent.id)
          .collection("deleted_submissions")
          .doc(s.id.replace("project", "game"))
      );
    }
  });
  // Update all tags
  const tagSnaps = await firestore.collection("tags").get();
  tagSnaps.forEach((s) => {
    if (s.exists) {
      const tagVal = { ...s.data() };
      delete tagVal["games"];
      bulkWriter.set(firestore.collection("tags").doc(s.id), tagVal);
    }
  });
  // Update all users
  const userSnaps = await firestore.collection("users").get();
  userSnaps.forEach((s) => {
    if (s.exists) {
      bulkWriter.delete(
        firestore
          .collection("users")
          .doc(s.id)
          .collection("submissions")
          .doc("games")
      );
    }
  });
  await bulkWriter.close();
  await database.ref(`pitched_games`).remove();
  const tagsDataSnap = await database.ref(`tags`).get();
  const tagsVal = tagsDataSnap.val() as Record<
    string,
    { agg: { game: number; games?: number } }
  >;
  const newTagsVal: Record<string, { agg: { game: number; games?: number } }> =
    {};
  Object.entries(tagsVal).forEach(([key, value]) => {
    const newVal = { ...value };
    delete newVal.agg.games;
    newTagsVal[key] = newVal;
  });
  await database.ref(`tags`).update(newTagsVal);
  const usersDataSnap = await database.ref(`users`).get();
  const usersVal = usersDataSnap.val() as {
    [key: string]: {
      agg: {
        [type: string]: {
          count: number;
          data: { [target: string]: Record<string, unknown> | null };
        };
      };
      deleted_submissions: { [target: string]: Record<string, unknown> | null };
    };
  };
  Object.entries(usersVal).forEach(([userId, userData]) => {
    Object.entries(userData.agg || {}).forEach(([type, agg]) => {
      const aggObj = userData.agg[type];
      if (aggObj) {
        const data = aggObj.data;
        if (data) {
          Object.entries(data).forEach(([target]) => {
            if (target.includes("games%")) {
              data[target] = null;
            }
          });
        }
        aggObj.count = Object.keys(aggObj.data || {}).length;
        userData.agg[type] = agg;
      }
    });
    Object.entries(userData.deleted_submissions || {}).forEach(([target]) => {
      if (target.includes("games%")) {
        userData.deleted_submissions[target] = null;
      }
    });
    usersVal[userId] = userData;
  });
  await database.ref(`users`).update(usersVal);
};

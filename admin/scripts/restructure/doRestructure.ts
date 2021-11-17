import * as admin from "firebase-admin";
import { ServiceAccount } from "firebase-admin";

export const doRestructure = async (
  credentials: ServiceAccount,
  databaseURL: string
) => {
  const adminApp = admin.initializeApp(
    {
      credential: admin.credential.cert(credentials),
      databaseURL
    },
    "to"
  );
  const firestore = adminApp.firestore();
  const bulkWriter = firestore.bulkWriter();
  // Copy all games/{id} to projects/{id}
  const gameSnaps = await firestore.collection("games").get()
  gameSnaps.forEach((s) => {
    if (s.exists) {
      bulkWriter.set(firestore.collection("projects").doc(s.id), {...s.data(), _documentType: "ProjectDocument", projectType: "game"});
    }
  })
  // Copy all pitched_games/{id} to pitched_projects/{id}
  const pitchedGameSnaps = await firestore.collection("pitched_games").get()
  pitchedGameSnaps.forEach((s) => {
    if (s.exists) {
      bulkWriter.set(firestore.collection("pitched_projects").doc(s.id), {...s.data(), _documentType: "ProjectDocument", projectType: "game"});
    }
  })
  // Copy all pitched_games/{id}/contributions/{contributionId} to pitched_projects/{id}/contributions/{contributionId}
  const contributionSnaps = await firestore.collectionGroup("contributions").get()
  contributionSnaps.forEach((s) => {
    if (s.exists) {
      bulkWriter.set(firestore.collection("pitched_projects").doc(s.ref.parent.parent.id).collection("contributions").doc(s.id), s.data());
    }
  })  
  // Copy all users/{id}/deleted_submissions/{submissionKey}
  const deletedSubmissionSnaps = await firestore.collectionGroup("deleted_submissions").get()
  deletedSubmissionSnaps.forEach((s) => {
    if (s.exists) {
      bulkWriter.set(firestore.collection("users").doc(s.ref.parent.parent.id).collection("deleted_submissions").doc(s.id.replace("game", "project")), {...s.data(), _documentType: "ProjectDocument", projectType: "game"});
    }
  })  
  // Update all tags
  const tagSnaps = await firestore.collection("tags").get()
  tagSnaps.forEach((s) => {
    if (s.exists) {
      bulkWriter.set(firestore.collection("tags").doc(s.id), {...s.data(), game: s.data().game || s.data().games || 1});
    }
  })
  // Update all users
  const userSnaps = await firestore.collection("users").get()
  userSnaps.forEach((s) => {
    if (s.exists) {
      bulkWriter.set(firestore.collection("users").doc(s.id).collection("submissions").doc("comments"), {_createdBy: s.id, _documentType: "PathDocument"}, {merge: true});
      bulkWriter.set(firestore.collection("users").doc(s.id).collection("submissions").doc("contributions"), {_createdBy: s.id, _documentType: "PathDocument"}, {merge: true});
      bulkWriter.set(firestore.collection("users").doc(s.id).collection("submissions").doc("notes"), {_createdBy: s.id, _documentType: "PathDocument"}, {merge: true});
      bulkWriter.set(firestore.collection("users").doc(s.id).collection("submissions").doc("phrases"), {_createdBy: s.id, _documentType: "PathDocument"}, {merge: true});
      bulkWriter.set(firestore.collection("users").doc(s.id).collection("submissions").doc("projects"), {_createdBy: s.id, _documentType: "PathDocument"}, {merge: true});
      bulkWriter.set(firestore.collection("users").doc(s.id).collection("submissions").doc("studios"), {_createdBy: s.id, _documentType: "PathDocument"}, {merge: true});
      bulkWriter.set(firestore.collection("users").doc(s.id).collection("submissions").doc("suggestions"), {_createdBy: s.id, _documentType: "PathDocument"}, {merge: true});
    }
  })
  await bulkWriter.close();
  const database = adminApp.database();
  const pitchedGamesDataSnap = await database.ref(`pitched_games`).get();
  await database.ref(`pitched_projects`).update(pitchedGamesDataSnap.val());
  const tagsDataSnap = await database.ref(`tags`).get();
  const tagsVal = tagsDataSnap.val() as {[key: string]: {agg: { game: number; games: number } }};
  const newTagsVal = {};
  Object.entries(tagsVal).forEach(([key, value]) => {
    const newVal = {...value, agg: { ...value.agg, game: value.agg.game || value.agg.games || 0 } };
    newTagsVal[key] = newVal;
  });
  await database.ref(`tags`).update(newTagsVal);
  const usersDataSnap = await database.ref(`users`).get();
  const usersVal = usersDataSnap.val() as {[key: string]: { agg: { [type: string]: {count: number; data: {[target: string]: Record<string, unknown>}} }; deleted_submissions: {[target: string]: Record<string, unknown>} }};
  Object.entries(usersVal).forEach(([userId, userData]) => {
    Object.entries(userData.agg || {}).forEach(([type, agg]) => {
      Object.entries(userData.agg[type].data || {}).forEach(([target, aggData]) => {
        userData.agg[type].data[target.replace("game", "project")] = aggData;
      })
      userData.agg[type] = agg;
    })
    Object.entries(userData.deleted_submissions || {}).forEach(([target, deletedSubmissionData]) => {
      userData.deleted_submissions[target.replace("game", "project")] = deletedSubmissionData;
    })
    usersVal[userId] = userData;
  });
  await database.ref(`users`).update(usersVal);
};

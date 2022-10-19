import * as admin from "firebase-admin";
import { ServiceAccount } from "firebase-admin";

export const doRestructure = async (
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
  const bulkWriter = firestore.bulkWriter();
  // Copy all games/{id} to projects/{id}
  console.log("Copy all games/{id} to projects/{id}");
  const gameSnaps = await firestore.collection("games").get();
  gameSnaps.forEach((s) => {
    if (s.exists) {
      bulkWriter.set(firestore.collection("projects").doc(s.id), {
        ...s.data(),
        _documentType: "ProjectDocument",
        projectType: "game",
      });
    }
  });
  // Copy all pitched_games/{id} to pitched_projects/{id}
  console.log("Copy all pitched_games/{id} to pitched_projects/{id}");
  const pitchedGameSnaps = await firestore.collection("pitched_games").get();
  pitchedGameSnaps.forEach((s) => {
    if (s.exists) {
      bulkWriter.set(firestore.collection("pitched_projects").doc(s.id), {
        ...s.data(),
        _documentType: "ProjectDocument",
        projectType: "game",
      });
    }
  });
  // Copy all pitched_games/{id}/contributions/{contributionId} to pitched_projects/{id}/contributions/{contributionId}
  console.log(
    "Copy all pitched_games/{id}/contributions/{contributionId} to pitched_projects/{id}/contributions/{contributionId}"
  );
  const contributionSnaps = await firestore
    .collectionGroup("contributions")
    .get();
  contributionSnaps.forEach((s) => {
    if (s.exists && s.ref.parent.parent) {
      bulkWriter.set(
        firestore
          .collection("pitched_projects")
          .doc(s.ref.parent.parent.id)
          .collection("contributions")
          .doc(s.id),
        s.data()
      );
    }
  });
  // Copy all users/{id}/deleted_submissions/{submissionKey}
  console.log("Copy all users/{id}/deleted_submissions/{submissionKey}");
  const deletedSubmissionSnaps = await firestore
    .collectionGroup("deleted_submissions")
    .get();
  deletedSubmissionSnaps.forEach((s) => {
    if (s.exists && s.ref.parent.parent) {
      bulkWriter.set(
        firestore
          .collection("users")
          .doc(s.ref.parent.parent.id)
          .collection("deleted_submissions")
          .doc(s.id.replace("game", "project")),
        { ...s.data(), _documentType: "ProjectDocument", projectType: "game" }
      );
    }
  });
  // Restructure all tags
  console.log("Restructure all tags");
  const tagSnaps = await firestore.collection("tags").get();
  tagSnaps.forEach((s) => {
    if (s.exists) {
      bulkWriter.set(firestore.collection("tags").doc(s.id), {
        ...s.data(),
        game: s.data()["game"] || s.data()["games"] || 1,
      });
    }
  });
  // Restructure all users
  console.log("Restructure all users");
  const userSnaps = await firestore.collection("users").get();
  await Promise.all(
    userSnaps.docs.map(async (s) => {
      const submissionsColRef = firestore
        .collection("users")
        .doc(s.id)
        .collection("submissions");
      const newSubmissionDoc = {
        _createdBy: s.id,
        _documentType: "PathDocument",
        _updates: {},
      };
      const promises: Promise<FirebaseFirestore.WriteResult>[] = [];

      const commentsDocRef = submissionsColRef.doc("comments");
      const commentsSnap = await commentsDocRef.get();
      if (!commentsSnap?.data()?.["_updates"]) {
        promises.push(
          bulkWriter.set(commentsDocRef, newSubmissionDoc, { merge: true })
        );
      }

      const contributionsDocRef = submissionsColRef.doc("contributions");
      const contributionsSnap = await contributionsDocRef.get();
      if (!contributionsSnap?.data()?.["_updates"]) {
        promises.push(
          bulkWriter.set(contributionsDocRef, newSubmissionDoc, { merge: true })
        );
      }

      const notesDocRef = submissionsColRef.doc("notes");
      const notesSnap = await notesDocRef.get();
      if (!notesSnap?.data()?.["_updates"]) {
        promises.push(
          bulkWriter.set(notesDocRef, newSubmissionDoc, { merge: true })
        );
      }

      const phrasesDocRef = submissionsColRef.doc("phrases");
      const phrasesSnap = await phrasesDocRef.get();
      if (!phrasesSnap?.data()?.["_updates"]) {
        promises.push(
          bulkWriter.set(phrasesDocRef, newSubmissionDoc, { merge: true })
        );
      }

      const projectsDocRef = submissionsColRef.doc("projects");
      const projectsSnap = await projectsDocRef.get();
      if (!projectsSnap?.data()?.["_updates"]) {
        promises.push(
          bulkWriter.set(projectsDocRef, newSubmissionDoc, { merge: true })
        );
      }

      const studiosDocRef = submissionsColRef.doc("studios");
      const studiosSnap = await studiosDocRef.get();
      if (!studiosSnap?.data()?.["_updates"]) {
        promises.push(
          bulkWriter.set(studiosDocRef, newSubmissionDoc, { merge: true })
        );
      }

      const suggestionsDocRef = submissionsColRef.doc("suggestions");
      const suggestionsSnap = await suggestionsDocRef.get();
      if (!suggestionsSnap?.data()?.["_updates"]) {
        promises.push(
          bulkWriter.set(suggestionsDocRef, newSubmissionDoc, { merge: true })
        );
      }

      return Promise.all(promises);
    })
  );
  await bulkWriter.close();

  // Restructure all database project aggregations
  console.log("Restructure all database aggregations");
  const database = adminApp.database();
  const pitchedGamesDataSnap = await database.ref(`pitched_games`).get();
  const pitchedGamesDataVal = pitchedGamesDataSnap.val();
  if (pitchedGamesDataVal) {
    await database.ref(`pitched_projects`).update(pitchedGamesDataVal);
  }

  // Restructure all database tag aggregations
  console.log("Restructure all database tag aggregations");
  const tagsDataSnap = await database.ref(`tags`).get();
  const tagsVal = tagsDataSnap.val() as Record<
    string,
    { agg: { game: number; games: number } }
  >;
  if (tagsVal) {
    const newTagsVal: Record<string, { agg: { game: number; games: number } }> =
      {};
    Object.entries(tagsVal).forEach(([key, value]) => {
      const newVal = {
        ...value,
        agg: { ...value.agg, game: value.agg.game || value.agg.games || 0 },
      };
      newTagsVal[key] = newVal;
    });
    await database.ref(`tags`).update(newTagsVal);
  }

  // Restructure all user aggregations
  console.log("Restructure all user aggregations");
  const usersDataSnap = await database.ref(`users`).get();
  const usersVal = usersDataSnap.val() as {
    [key: string]: {
      agg: {
        [type: string]: {
          count: number;
          data: { [target: string]: Record<string, unknown> };
        };
      };
      deleted_submissions: { [target: string]: Record<string, unknown> };
    };
  };
  if (usersVal) {
    Object.entries(usersVal).forEach(([userId, userData]) => {
      Object.entries(userData.agg || {}).forEach(([type, agg]) => {
        const aggObj = userData.agg[type];
        if (aggObj) {
          Object.entries(aggObj.data || {}).forEach(([target, aggData]) => {
            aggObj.data[target.replace("game", "project")] = aggData;
          });
        }
        userData.agg[type] = agg;
      });
      Object.entries(userData.deleted_submissions || {}).forEach(
        ([target, deletedSubmissionData]) => {
          userData.deleted_submissions[target.replace("game", "project")] =
            deletedSubmissionData;
        }
      );
      usersVal[userId] = userData;
    });
    await database.ref(`users`).update(usersVal);
  }
};

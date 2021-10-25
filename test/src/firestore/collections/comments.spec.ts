import * as firebase from "@firebase/rules-unit-testing";
import { MY_ID, MY_VALID_AUTH } from "../../constants";
import { getAdmin, getClient } from "../../utils";
import {
  createSubmissionDoc,
  deleteSubmissionDoc,
  getCreateMetadata,
  getSubmissionDoc,
  getUpdateMetadata,
  listSubmissionDocs,
  setupSubmissionCounter,
  updateSubmissionDoc,
} from "../utils";

export const testComments = (
  collection: "published_studios" | "published_resources" | "published_games",
  docId: string
) => {
  describe("comments", () => {
    it("can get", async () => {
      await firebase.assertSucceeds(
        getSubmissionDoc(undefined, collection, "comments", docId, `${MY_ID}`)
      );
    });
    it("can list 100 at a time", async () => {
      await firebase.assertSucceeds(
        listSubmissionDocs(undefined, collection, "comments", 100)
      );
    });
    it("can create with required fields", async () => {
      const doc = {
        ...getCreateMetadata(MY_VALID_AUTH),
        _documentType: "CommentDocument",
        commented: true,
        content: "This is my comment",
      };
      await setupSubmissionCounter("comments");
      await firebase.assertSucceeds(
        createSubmissionDoc(
          MY_VALID_AUTH,
          collection,
          "comments",
          doc,
          docId,
          `${MY_ID}`
        )
      );
    });
    it("can update", async () => {
      await firebase.assertSucceeds(
        updateSubmissionDoc(
          MY_VALID_AUTH,
          collection,
          "comments",
          undefined,
          docId,
          `${MY_ID}`
        )
      );
    });
    it("can uncomment", async () => {
      const admin = getAdmin();
      const client = getClient(MY_VALID_AUTH);
      const ref = client
        .firestore()
        .collection(collection)
        .doc(docId)
        .collection("comments")
        .doc(MY_ID);
      await admin
        .firestore()
        .doc(ref.path)
        .set({
          ...getCreateMetadata(MY_VALID_AUTH, true),
          commented: true,
        });
      await firebase.assertSucceeds(
        ref.update({
          ...getUpdateMetadata(MY_VALID_AUTH),
          commented: false,
        })
      );
    });
    it("can comment after uncommenting", async () => {
      const admin = getAdmin();
      const client = getClient(MY_VALID_AUTH);
      const ref = client
        .firestore()
        .collection(collection)
        .doc(docId)
        .collection("comments")
        .doc(MY_ID);
      await admin
        .firestore()
        .doc(ref.path)
        .set({
          ...getCreateMetadata(MY_VALID_AUTH, true),
          commented: false,
        });
      await firebase.assertSucceeds(
        ref.update({
          ...getUpdateMetadata(MY_VALID_AUTH),
          commented: true,
        })
      );
    });
    it("CANNOT delete", async () => {
      await firebase.assertFails(
        deleteSubmissionDoc(
          MY_VALID_AUTH,
          collection,
          "comments",
          `${MY_ID}`,
          docId
        )
      );
    });
    it("CANNOT create more than 300 in a day", async () => {
      const doc = {
        ...getCreateMetadata(MY_VALID_AUTH),
        _documentType: "CommentDocument",
        commented: true,
        content: "This is my story",
      };
      await setupSubmissionCounter("comments", 299);
      await firebase.assertSucceeds(
        createSubmissionDoc(
          MY_VALID_AUTH,
          collection,
          "comments",
          doc,
          undefined,
          `${MY_ID}`
        )
      );
      await firebase.assertFails(
        createSubmissionDoc(
          MY_VALID_AUTH,
          collection,
          "comments",
          doc,
          docId,
          `${MY_ID}`
        )
      );
    });
  });
};

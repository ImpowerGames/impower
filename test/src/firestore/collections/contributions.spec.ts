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

export const testContributions = (
  collection: "pitched_resources" | "pitched_games",
  docId: string
) => {
  describe("contributions", () => {
    it("can get", async () => {
      await firebase.assertSucceeds(
        getSubmissionDoc(
          undefined,
          collection,
          "contributions",
          docId,
          `${MY_ID}-story`
        )
      );
    });
    it("can list 100 at a time", async () => {
      await firebase.assertSucceeds(
        listSubmissionDocs(undefined, collection, "contributions", 100)
      );
    });
    it("can create with correct id and required fields", async () => {
      const doc = {
        ...getCreateMetadata(MY_VALID_AUTH),
        _documentType: "ContributionDocument",
        contributed: true,
        contributionType: "story",
        content: "This is my story",
      };
      await setupSubmissionCounter("contributions");
      await firebase.assertSucceeds(
        createSubmissionDoc(
          MY_VALID_AUTH,
          collection,
          "contributions",
          doc,
          docId,
          `${MY_ID}-story`
        )
      );
    });
    it("can update", async () => {
      await firebase.assertSucceeds(
        updateSubmissionDoc(
          MY_VALID_AUTH,
          collection,
          "contributions",
          undefined,
          docId,
          `${MY_ID}-story`
        )
      );
    });
    it("can uncontribute", async () => {
      const admin = getAdmin();
      await admin
        .firestore()
        .collection(collection)
        .doc(docId)
        .collection("contributions")
        .doc(MY_ID + "-story")
        .set({
          ...getCreateMetadata(MY_VALID_AUTH, true),
        });
      const client = getClient(MY_VALID_AUTH);
      const ref = client
        .firestore()
        .collection(collection)
        .doc(docId)
        .collection("contributions")
        .doc(MY_ID + "-story");
      await firebase.assertSucceeds(
        ref.update({ ...getUpdateMetadata(MY_VALID_AUTH), contributed: false })
      );
    });
    it("can contribute after uncontributing", async () => {
      const admin = getAdmin();
      await admin
        .firestore()
        .collection(collection)
        .doc(docId)
        .collection("contributions")
        .doc(MY_ID + "-story")
        .set({
          ...getCreateMetadata(MY_VALID_AUTH, true),
          contributed: false,
        });
      const client = getClient(MY_VALID_AUTH);
      const ref = client
        .firestore()
        .collection(collection)
        .doc(docId)
        .collection("contributions")
        .doc(MY_ID + "-story");
      await firebase.assertSucceeds(
        ref.update({
          ...getUpdateMetadata(MY_VALID_AUTH),
          contributed: true,
        })
      );
    });
    it("CANNOT create without correctly formatted id", async () => {
      const doc = {
        ...getCreateMetadata(MY_VALID_AUTH),
        _documentType: "ContributionDocument",
        contributed: true,
        contributionType: "story",
        content: "This is my story",
      };
      await setupSubmissionCounter("contributions");
      await firebase.assertFails(
        createSubmissionDoc(MY_VALID_AUTH, collection, "contributions", doc)
      );
    });
    it("CANNOT delete", async () => {
      await firebase.assertFails(
        deleteSubmissionDoc(
          MY_VALID_AUTH,
          collection,
          "contributions",
          docId,
          `${MY_ID}-story`
        )
      );
    });
    it("CANNOT create more than 100 in a day", async () => {
      const doc = {
        ...getCreateMetadata(MY_VALID_AUTH),
        _documentType: "ContributionDocument",
        contributed: true,
        contributionType: "story",
        content: "This is my story",
      };
      await setupSubmissionCounter("contributions", 99);
      await firebase.assertSucceeds(
        createSubmissionDoc(
          MY_VALID_AUTH,
          collection,
          "contributions",
          doc,
          undefined,
          `${MY_ID}-story`
        )
      );
      await firebase.assertFails(
        createSubmissionDoc(
          MY_VALID_AUTH,
          collection,
          "contributions",
          doc,
          docId,
          `${MY_ID}-story`
        )
      );
    });
  });
};

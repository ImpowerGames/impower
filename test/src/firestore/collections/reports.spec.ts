import * as firebase from "@firebase/rules-unit-testing";
import { MY_ID, MY_VALID_AUTH, THEIR_ID } from "../../constants";
import {
  createSubmissionDoc,
  deleteSubmissionDoc,
  getCreateMetadata,
  getSubmissionDoc,
  listSubmissionDocs,
  setupSubmissionCounter,
  updateSubmissionDoc,
} from "../utils";

export const testReports = (collectionPath: string) => {
  describe("reports", () => {
    it("can create", async () => {
      await setupSubmissionCounter("reports");
      const doc = {
        _documentType: "ReportDocument",
        ...getCreateMetadata(MY_VALID_AUTH),
        reason: "spam",
        content: "This is spam!",
      };
      await firebase.assertSucceeds(
        createSubmissionDoc(MY_VALID_AUTH, collectionPath, "reports", doc)
      );
    });
    it("can update", async () => {
      await firebase.assertSucceeds(
        updateSubmissionDoc(MY_VALID_AUTH, collectionPath, "reports")
      );
    });
    it("CANNOT delete", async () => {
      await firebase.assertFails(
        deleteSubmissionDoc(
          MY_VALID_AUTH,
          collectionPath,
          "reports",
          THEIR_ID,
          MY_ID
        )
      );
    });
    it("CANNOT get", async () => {
      await firebase.assertFails(
        getSubmissionDoc(
          MY_VALID_AUTH,
          collectionPath,
          "reports",
          THEIR_ID,
          MY_ID
        )
      );
    });
    it("CANNOT list", async () => {
      await firebase.assertFails(
        listSubmissionDocs(MY_VALID_AUTH, collectionPath, "reports", 1)
      );
    });
    it("CANNOT create more than 100 in a day", async () => {
      const doc = {
        _documentType: "ReportDocument",
        ...getCreateMetadata(MY_VALID_AUTH),
        reason: "spam",
        content: "This is spam!",
      };
      await setupSubmissionCounter("reports", 99);
      await firebase.assertSucceeds(
        createSubmissionDoc(MY_VALID_AUTH, collectionPath, "reports", doc)
      );
      await firebase.assertFails(
        createSubmissionDoc(MY_VALID_AUTH, collectionPath, "reports", doc)
      );
    });
  });
};

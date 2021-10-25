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

export const testSuggestions = (collectionPath: string) => {
  describe("suggestions", () => {
    it("can create", async () => {
      await setupSubmissionCounter("suggestions");
      const doc = {
        _documentType: "SuggestionDocument",
        ...getCreateMetadata(MY_VALID_AUTH),
        edit: "An Edited Phrase",
      };
      await firebase.assertSucceeds(
        createSubmissionDoc(MY_VALID_AUTH, collectionPath, "suggestions", doc)
      );
    });
    it("can update", async () => {
      await firebase.assertSucceeds(
        updateSubmissionDoc(MY_VALID_AUTH, collectionPath, "suggestions")
      );
    });
    it("CANNOT delete", async () => {
      await firebase.assertFails(
        deleteSubmissionDoc(
          MY_VALID_AUTH,
          collectionPath,
          "suggestions",
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
          "suggestions",
          THEIR_ID,
          MY_ID
        )
      );
    });
    it("CANNOT list", async () => {
      await firebase.assertFails(
        listSubmissionDocs(MY_VALID_AUTH, collectionPath, "suggestions", 1)
      );
    });
    it("CANNOT create more than 100 in a day", async () => {
      const doc = {
        _documentType: "SuggestionDocument",
        ...getCreateMetadata(MY_VALID_AUTH),
        edit: "An Edited Phrase",
      };
      await setupSubmissionCounter("suggestions", 99);
      await firebase.assertSucceeds(
        createSubmissionDoc(MY_VALID_AUTH, collectionPath, "suggestions", doc)
      );
      await firebase.assertFails(
        createSubmissionDoc(MY_VALID_AUTH, collectionPath, "suggestions", doc)
      );
    });
  });
};

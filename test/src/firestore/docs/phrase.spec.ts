import * as firebase from "@firebase/rules-unit-testing";
import { MY_VALID_AUTH } from "../../constants";
import {
  getCreateMetadata,
  createSubmissionDoc,
  deleteSubmissionDoc,
  getSubmissionDoc,
  listSubmissionDocs,
  setupSubmissionCounter,
  updateSubmissionDoc,
} from "../utils";

export const testPhrase = () => {
  it("can get", async () => {
    await firebase.assertSucceeds(
      getSubmissionDoc(undefined, "phrases", "phrases", "This Is My Phrase")
    );
  });
  it("can create", async () => {
    const doc = {
      _documentType: "PhraseDocument",
      ...getCreateMetadata(MY_VALID_AUTH),
    };
    await setupSubmissionCounter("phrases");
    await firebase.assertSucceeds(
      createSubmissionDoc(
        MY_VALID_AUTH,
        "phrases",
        "phrases",
        doc,
        "This Is My Phrase"
      )
    );
  });
  it("CANNOT create with restricted or unrecognized fields", async () => {
    const doc = {
      _documentType: "PhraseDocument",
      ...getCreateMetadata(MY_VALID_AUTH),
      admin: true,
    };
    await setupSubmissionCounter("phrases");
    await firebase.assertFails(
      createSubmissionDoc(MY_VALID_AUTH, "phrases", "phrases", doc)
    );
  });
  it("CANNOT list", async () => {
    await firebase.assertFails(
      listSubmissionDocs(MY_VALID_AUTH, "phrases", "phrases", 1)
    );
  });
  it("CANNOT update", async () => {
    await firebase.assertFails(
      updateSubmissionDoc(MY_VALID_AUTH, "phrases", "phrases")
    );
  });
  it("CANNOT delete", async () => {
    await firebase.assertFails(
      deleteSubmissionDoc(MY_VALID_AUTH, "phrases", "phrases")
    );
  });
};

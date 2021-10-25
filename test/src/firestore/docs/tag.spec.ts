import * as firebase from "@firebase/rules-unit-testing";
import { MY_VALID_AUTH } from "../../constants";
import {
  getCreateMetadata,
  createDoc,
  deleteDoc,
  getDoc,
  listDocs,
  updateDoc,
} from "../utils";

export const testTag = () => {
  it("can get", async () => {
    await firebase.assertSucceeds(getDoc(undefined, "tags"));
  });
  it("can list 100 at a time", async () => {
    await firebase.assertSucceeds(listDocs(undefined, "tags", 100));
  });
  it("CANNOT list more than 100 at a time", async () => {
    await firebase.assertFails(listDocs(MY_VALID_AUTH, "tags"));
    await firebase.assertFails(listDocs(MY_VALID_AUTH, "tags", 200));
  });
  it("CANNOT create", async () => {
    const doc = {
      _documentType: "TagDocument",
      name: "tag",
      nsfw: false,
      ...getCreateMetadata(MY_VALID_AUTH),
    };
    await firebase.assertFails(createDoc(MY_VALID_AUTH, "tags", doc));
  });
  it("CANNOT update", async () => {
    await firebase.assertFails(updateDoc(MY_VALID_AUTH, "tags"));
  });
  it("CANNOT delete", async () => {
    await firebase.assertFails(deleteDoc(undefined, "tags"));
  });
};

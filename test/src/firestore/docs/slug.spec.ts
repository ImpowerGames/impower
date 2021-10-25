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

export const testSlug = () => {
  it("can get", async () => {
    await firebase.assertSucceeds(getDoc(undefined, "slugs"));
  });
  it("CANNOT list", async () => {
    await firebase.assertFails(listDocs(MY_VALID_AUTH, "slugs", 1));
  });
  it("CANNOT create", async () => {
    const doc = {
      _documentType: "SlugDocument",
      ...getCreateMetadata(MY_VALID_AUTH),
    };
    await firebase.assertFails(createDoc(MY_VALID_AUTH, "slugs", doc));
  });
  it("CANNOT update", async () => {
    await firebase.assertFails(updateDoc(MY_VALID_AUTH, "slugs"));
  });
  it("CANNOT delete", async () => {
    await firebase.assertFails(deleteDoc(MY_VALID_AUTH, "slugs"));
  });
};

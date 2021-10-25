import * as firebase from "@firebase/rules-unit-testing";
import { MY_VALID_AUTH } from "../../constants";
import {
  getCreateMetadata,
  getDoc,
  listDocs,
  createDoc,
  updateDoc,
} from "../utils";

export const testPublishedPage = (
  collection: "published_studios" | "published_resources" | "published_games",
  documentType: "StudioDocument" | "ResourceDocument" | "GameDocument"
) => {
  it("can get", async () => {
    await firebase.assertSucceeds(getDoc(undefined, collection));
  });
  it("can list 100 at a time", async () => {
    await firebase.assertSucceeds(listDocs(undefined, collection, 100));
  });
  it("CANNOT list more than 100 at a time", async () => {
    await firebase.assertFails(listDocs(MY_VALID_AUTH, collection));
  });
  it("CANNOT create", async () => {
    const doc = {
      _documentType: documentType,
      ...getCreateMetadata(MY_VALID_AUTH),
      name: "My Page Name",
      slug: "my_page_slug",
    };
    await firebase.assertFails(createDoc(MY_VALID_AUTH, collection, doc));
  });
  it("CANNOT update", async () => {
    await firebase.assertFails(updateDoc(MY_VALID_AUTH, collection));
  });
};

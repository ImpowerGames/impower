import * as firebase from "@firebase/rules-unit-testing";
import { MY_VALID_AUTH } from "../../constants";
import {
  getCreateMetadata,
  getDoc,
  listDocs,
  createDoc,
  updateDoc,
} from "../utils";

export const testPitchedProject = (
  collection: "pitched_resources" | "pitched_games",
  documentType: "ResourceDocument" | "GameDocument"
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
      name: "My Project Name",
      slug: "my_project_slug",
    };
    await firebase.assertFails(createDoc(MY_VALID_AUTH, collection, doc));
  });
  it("CANNOT update", async () => {
    await firebase.assertFails(updateDoc(MY_VALID_AUTH, collection));
  });
};

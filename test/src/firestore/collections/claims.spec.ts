import * as firebase from "@firebase/rules-unit-testing";
import { MY_VALID_AUTH, MY_ID } from "../../constants";
import {
  getDoc,
  listDocs,
  createDoc,
  getCreateMetadata,
  getUpdateMetadata,
  deleteDoc,
  updateDoc,
} from "../utils";

export const testClaims = (collection: "users") => {
  describe("claims", () => {
    it("can get your own", async () => {
      await firebase.assertSucceeds(
        getDoc(MY_VALID_AUTH, `${collection}/${MY_ID}/claims`, "ClaimsDocument")
      );
    });
    it("can list your own", async () => {
      await firebase.assertSucceeds(
        listDocs(MY_VALID_AUTH, `${collection}/${MY_ID}/claims`)
      );
    });
    it("CANNOT create", async () => {
      await firebase.assertFails(
        createDoc(
          MY_VALID_AUTH,
          `${collection}/${MY_ID}/claims`,
          {
            _documentType: "ClaimsDocument",
            ...getCreateMetadata(MY_VALID_AUTH),
          },
          "ClaimsDocument"
        )
      );
    });
    it("CANNOT update", async () => {
      await firebase.assertFails(
        updateDoc(
          MY_VALID_AUTH,
          `${collection}/${MY_ID}/claims`,
          {
            ...getUpdateMetadata(MY_VALID_AUTH),
          },
          "ClaimsDocument"
        )
      );
    });
    it("CANNOT delete", async () => {
      await firebase.assertFails(
        deleteDoc(
          MY_VALID_AUTH,
          `${collection}/${MY_ID}/claims`,
          "ClaimsDocument"
        )
      );
    });
  });
};

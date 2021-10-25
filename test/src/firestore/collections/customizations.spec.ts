import * as firebase from "@firebase/rules-unit-testing";
import { MY_VALID_AUTH, MY_ID, THEIR_ID } from "../../constants";
import { testCustomization } from "../docs/customization.spec";
import { listDocs } from "../utils";

export const testCustomizations = (collection: "users") => {
  describe("customizations", () => {
    it("can list your own", async () => {
      await firebase.assertSucceeds(
        listDocs(MY_VALID_AUTH, `${collection}/${MY_ID}/customizations`)
      );
    });
    it("CANNOT list if unauthenticated", async () => {
      await firebase.assertFails(
        listDocs(undefined, `${collection}/${MY_ID}/customizations`, 1)
      );
    });
    it("CANNOT list if not yours", async () => {
      await firebase.assertFails(
        listDocs(MY_VALID_AUTH, `${collection}/${THEIR_ID}/customizations`, 1)
      );
    });

    testCustomization(collection, "phrase_additions");

    testCustomization(collection, "phrase_deletions");
  });
};

import * as firebase from "@firebase/rules-unit-testing";
import { MY_VALID_AUTH, MY_ID } from "../../constants";
import { getClient } from "../../utils";

export const testGroups = () => {
  describe("groups", () => {
    it("can list comments", async () => {
      const client = getClient(MY_VALID_AUTH);
      const ref = client
        .firestore()
        .collectionGroup("comments")
        .where("_createdBy", "==", MY_ID)
        .limit(100);
      await firebase.assertSucceeds(ref.get());
    });
    it("can list contributions", async () => {
      const client = getClient(MY_VALID_AUTH);
      const ref = client
        .firestore()
        .collectionGroup("contributions")
        .where("_createdBy", "==", MY_ID)
        .limit(100);
      await firebase.assertSucceeds(ref.get());
    });
  });
};

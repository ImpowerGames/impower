import * as firebase from "@firebase/rules-unit-testing";
import { MY_ID, MY_VALID_AUTH, THEIR_ID } from "../../constants";
import { testSubmission } from "../docs/submission.spec";
import { listDocs } from "../utils";

export const testSubmissions = (collection: "users") => {
  describe("submissions", () => {
    it("can list your own", async () => {
      await firebase.assertSucceeds(
        listDocs(MY_VALID_AUTH, `${collection}/${MY_ID}/submissions`)
      );
    });
    it("CANNOT list if unauthenticated", async () => {
      await firebase.assertFails(
        listDocs(undefined, `${collection}/${MY_ID}/submissions`, 1)
      );
    });
    it("CANNOT list if not yours", async () => {
      await firebase.assertFails(
        listDocs(MY_VALID_AUTH, `${collection}/${THEIR_ID}/submissions`, 1)
      );
    });

    testSubmission(collection, "comments");

    testSubmission(collection, "contributions");

    testSubmission(collection, "games");

    testSubmission(collection, "phrases");

    testSubmission(collection, "reports");

    testSubmission(collection, "resources");

    testSubmission(collection, "studios");

    testSubmission(collection, "suggestions");
  });
};

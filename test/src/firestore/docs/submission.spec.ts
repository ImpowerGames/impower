import * as firebase from "@firebase/rules-unit-testing";
import {
  MY_ID,
  MY_VALID_AUTH,
  SubmissionType,
  THEIR_ID,
} from "../../constants";
import {
  createDoc,
  getCreateMetadata,
  getDoc,
  getUpdateMetadata,
  updateDoc,
} from "../utils";

export const testSubmission = (collection: "users", type: SubmissionType) => {
  describe(type, () => {
    it("can get your own", async () => {
      await firebase.assertSucceeds(
        getDoc(MY_VALID_AUTH, `${collection}/${MY_ID}/submissions`, type)
      );
    });
    it("can create for yourself", async () => {
      await firebase.assertSucceeds(
        createDoc(
          MY_VALID_AUTH,
          `${collection}/${MY_ID}/submissions`,
          {
            _documentType: "PathDocument",
            path: "",
            ...getCreateMetadata(MY_VALID_AUTH),
          },
          type
        )
      );
    });
    it("can update yourself", async () => {
      await firebase.assertSucceeds(
        updateDoc(
          MY_VALID_AUTH,
          `${collection}/${MY_ID}/submissions`,
          {
            ...getUpdateMetadata(MY_VALID_AUTH),
          },
          type
        )
      );
    });
    it("CANNOT create with restricted or unrecognized fields", async () => {
      await firebase.assertFails(
        createDoc(
          MY_VALID_AUTH,
          `${collection}/${MY_ID}/submissions`,
          {
            _documentType: "PathDocument",
            ...getCreateMetadata(MY_VALID_AUTH),
            admin: true,
          },
          type
        )
      );
    });
    it("CANNOT update with restricted or unrecognized fields", async () => {
      await firebase.assertFails(
        updateDoc(
          MY_VALID_AUTH,
          `${collection}/${MY_ID}/submissions`,
          {
            ...getCreateMetadata(MY_VALID_AUTH),
            admin: true,
          },
          type
        )
      );
    });
    it("CANNOT get if unauthenticated", async () => {
      await firebase.assertFails(
        getDoc(undefined, `${collection}/${MY_ID}/submissions`, type)
      );
    });
    it("CANNOT create for another user", async () => {
      await firebase.assertFails(
        createDoc(
          MY_VALID_AUTH,
          `${collection}/${THEIR_ID}/submissions`,
          {
            _documentType: "PathDocument",
            ...getCreateMetadata(MY_VALID_AUTH),
          },
          type
        )
      );
    });
  });
};

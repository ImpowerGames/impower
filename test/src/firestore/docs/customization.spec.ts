import * as firebase from "@firebase/rules-unit-testing";
import {
  MY_VALID_AUTH,
  MY_ID,
  THEIR_ID,
  CustomizationType,
} from "../../constants";
import {
  getDoc,
  createDoc,
  getCreateMetadata,
  updateDoc,
  getUpdateMetadata,
  deleteDoc,
} from "../utils";

export const testCustomization = (
  collection: "users",
  type: CustomizationType
) => {
  describe(type, () => {
    it("can get your own", async () => {
      await firebase.assertSucceeds(
        getDoc(MY_VALID_AUTH, `${collection}/${MY_ID}/customizations`, type)
      );
    });
    it("can create for yourself", async () => {
      await firebase.assertSucceeds(
        createDoc(
          MY_VALID_AUTH,
          `${collection}/${MY_ID}/customizations`,
          {
            _documentType: "CustomizationDocument",
            ...getCreateMetadata(MY_VALID_AUTH),
            phraseTags: {},
          },
          type
        )
      );
    });
    it("can update yourself", async () => {
      await firebase.assertSucceeds(
        updateDoc(
          MY_VALID_AUTH,
          `${collection}/${MY_ID}/customizations`,
          undefined,
          type
        )
      );
    });
    it("CANNOT create with restricted or unrecognized fields", async () => {
      await firebase.assertFails(
        createDoc(
          MY_VALID_AUTH,
          `${collection}/${MY_ID}/customizations`,
          {
            _documentType: "CustomizationDocument",
            ...getCreateMetadata(MY_VALID_AUTH),
            phraseTags: {},
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
          `${collection}/${MY_ID}/customizations`,
          {
            ...getUpdateMetadata(MY_VALID_AUTH),
            admin: true,
          },
          type
        )
      );
    });
    it("CANNOT create for another user", async () => {
      await firebase.assertFails(
        createDoc(
          MY_VALID_AUTH,
          `${collection}/${THEIR_ID}/customizations`,
          {
            _documentType: "CustomizationDocument",
            ...getCreateMetadata(MY_VALID_AUTH),
            phraseTags: {},
          },
          type
        )
      );
    });
    it("CANNOT delete", async () => {
      await firebase.assertFails(
        deleteDoc(MY_VALID_AUTH, `${collection}/${MY_ID}/customizations`, type)
      );
    });
  });
};

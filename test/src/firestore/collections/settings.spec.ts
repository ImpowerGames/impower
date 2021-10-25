import * as firebase from "@firebase/rules-unit-testing";
import { MY_VALID_AUTH, MY_ID, THEIR_ID, settingTypes } from "../../constants";
import {
  getDoc,
  listDocs,
  createDoc,
  getCreateMetadata,
  updateDoc,
  getUpdateMetadata,
  deleteDoc,
} from "../utils";

export const testSettings = (collection: "users") => {
  describe("settings", () => {
    it("can get your own", async () => {
      await Promise.all(
        settingTypes.map((type) =>
          firebase.assertSucceeds(
            getDoc(MY_VALID_AUTH, `${collection}/${MY_ID}/settings`, type)
          )
        )
      );
    });
    it("can list your own", async () => {
      await firebase.assertSucceeds(
        listDocs(MY_VALID_AUTH, `${collection}/${MY_ID}/settings`)
      );
    });
    it("can create", async () => {
      await firebase.assertSucceeds(
        createDoc(
          MY_VALID_AUTH,
          `${collection}/${MY_ID}/settings`,
          {
            _documentType: "SettingsDocument",
            ...getCreateMetadata(MY_VALID_AUTH),
            emailMarketing: true,
            nsfwVisible: true,
          },
          "account"
        )
      );
    });
    it("can update yourself", async () => {
      await firebase.assertSucceeds(
        updateDoc(
          MY_VALID_AUTH,
          `${collection}/${MY_ID}/settings`,
          {
            ...getUpdateMetadata(MY_VALID_AUTH),
            emailMarketing: false,
            nsfwVisible: false,
          },
          "account"
        )
      );
    });
    it("CANNOT create with restricted or unrecognized fields", async () => {
      await firebase.assertFails(
        createDoc(
          MY_VALID_AUTH,
          `${collection}/${MY_ID}/settings`,
          {
            _documentType: "SettingsDocument",
            ...getCreateMetadata(MY_VALID_AUTH),
            admin: true,
          },
          "account"
        )
      );
    });
    it("CANNOT create for another user", async () => {
      await Promise.all(
        settingTypes.map((type) =>
          firebase.assertFails(
            createDoc(
              MY_VALID_AUTH,
              `${collection}/${THEIR_ID}/settings`,
              {
                _documentType: "SettingsDocument",
                ...getCreateMetadata(MY_VALID_AUTH),
              },
              type
            )
          )
        )
      );
    });
    it("CANNOT update with restricted or unrecognized fields", async () => {
      await firebase.assertFails(
        updateDoc(
          MY_VALID_AUTH,
          `${collection}/${MY_ID}/settings`,
          {
            ...getUpdateMetadata(MY_VALID_AUTH),
            admin: true,
          },
          "account"
        )
      );
    });
    it("CANNOT delete", async () => {
      await Promise.all(
        settingTypes.map((type) =>
          firebase.assertFails(
            deleteDoc(MY_VALID_AUTH, `${collection}/${MY_ID}/settings`, type)
          )
        )
      );
    });
  });
};

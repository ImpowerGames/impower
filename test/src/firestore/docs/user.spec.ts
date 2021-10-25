import * as firebase from "@firebase/rules-unit-testing";
import {
  invalidUsernames,
  MY_EXPIRED_AUTH,
  MY_ID,
  MY_USERNAME,
  MY_VALID_AUTH,
  THEIR_ID,
  THEIR_USERNAME,
  THEIR_VALID_AUTH,
} from "../../constants";
import { getAdmin, getClient } from "../../utils";
import {
  getCreateMetadata,
  createDoc,
  deleteDoc,
  getDoc,
  listDocs,
  updateDoc,
  getUpdateMetadata,
} from "../utils";

export const testUser = () => {
  it("can get", async () => {
    await firebase.assertSucceeds(getDoc(undefined, "users"));
  });
  it("can list 100 at a time", async () => {
    await firebase.assertSucceeds(listDocs(undefined, "users", 100));
  });
  it("can update your username", async () => {
    const doc = {
      _documentType: "UserDocument",
      ...getUpdateMetadata(MY_VALID_AUTH),
      username: MY_USERNAME + 1,
    };
    await firebase.assertSucceeds(
      updateDoc(MY_VALID_AUTH, "users", doc, MY_ID)
    );
  });
  it("can update your icon", async () => {
    const doc = {
      _documentType: "UserDocument",
      ...getUpdateMetadata(MY_VALID_AUTH),
      icon: { fileUrl: "https://images.com/my_icon" },
    };
    await firebase.assertSucceeds(
      updateDoc(MY_VALID_AUTH, "users", doc, MY_ID)
    );
  });
  it("can update your bio", async () => {
    const doc = {
      _documentType: "UserDocument",
      ...getUpdateMetadata(MY_VALID_AUTH),
      bio: "This is a bio",
    };
    await firebase.assertSucceeds(
      updateDoc(MY_VALID_AUTH, "users", doc, MY_ID)
    );
  });
  it("CANNOT list more than 100 at a time", async () => {
    await firebase.assertFails(listDocs(MY_VALID_AUTH, "users"));
    await firebase.assertFails(listDocs(MY_VALID_AUTH, "users", 200));
  });
  it("CANNOT create your own user document", async () => {
    const doc = {
      _documentType: "UserDocument",
      ...getCreateMetadata(MY_VALID_AUTH),
      username: MY_USERNAME,
    };
    await firebase.assertFails(createDoc(MY_VALID_AUTH, "users", doc, MY_ID));
  });
  it("CANNOT update if unauthenticated", async () => {
    const doc = {
      _documentType: "UserDocument",
      ...getUpdateMetadata(MY_VALID_AUTH),
      username: MY_USERNAME + 1,
    };
    await firebase.assertFails(updateDoc(undefined, "users", doc, MY_ID));
  });
  it("CANNOT update another user", async () => {
    await firebase.assertFails(
      updateDoc(
        MY_VALID_AUTH,
        "users",
        {
          ...getUpdateMetadata(THEIR_VALID_AUTH),
          username: THEIR_USERNAME + 1,
        },
        THEIR_ID
      )
    );
    await firebase.assertFails(
      updateDoc(
        MY_VALID_AUTH,
        "users",
        {
          ...getUpdateMetadata(MY_VALID_AUTH),
          username: THEIR_USERNAME + 1,
        },
        THEIR_ID
      )
    );
  });
  it("CANNOT update if auth expired", async () => {
    const doc = {
      _documentType: "UserDocument",
      ...getUpdateMetadata(MY_VALID_AUTH),
      username: MY_USERNAME + 1,
    };
    await firebase.assertFails(updateDoc(MY_EXPIRED_AUTH, "users", doc, MY_ID));
  });
  it("CANNOT update without required metadata", async () => {
    const doc = {
      username: MY_USERNAME + 1,
    };
    await firebase.assertFails(updateDoc(MY_VALID_AUTH, "users", doc, MY_ID));
  });
  it("CANNOT update with invalid metadata", async () => {
    await firebase.assertFails(
      updateDoc(
        MY_VALID_AUTH,
        "users",
        {
          ...getUpdateMetadata(MY_VALID_AUTH),
          _createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        MY_ID
      )
    );
    await firebase.assertFails(
      updateDoc(
        MY_VALID_AUTH,
        "users",
        {
          ...getUpdateMetadata(MY_VALID_AUTH),
          _updatedBy: THEIR_ID,
        },
        MY_ID
      )
    );
    await firebase.assertFails(
      updateDoc(
        MY_VALID_AUTH,
        "users",
        {
          ...getUpdateMetadata(MY_VALID_AUTH),
          _updatedBy: 123,
        },
        MY_ID
      )
    );
    await firebase.assertFails(
      updateDoc(
        MY_VALID_AUTH,
        "users",
        {
          ...getUpdateMetadata(MY_VALID_AUTH),
          _updatedAt: new Date(),
        },
        MY_ID
      )
    );
  });
  it("CANNOT update more than 50 times in a day", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .set({
        _documentType: "UserDocument",
        ...getCreateMetadata(MY_VALID_AUTH, true, 49),
        username: MY_USERNAME,
      });

    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection("users").doc(MY_ID);
    await firebase.assertSucceeds(
      ref.update({
        ...getUpdateMetadata(MY_VALID_AUTH),
      })
    );
    await firebase.assertFails(
      ref.update({
        ...getUpdateMetadata(MY_VALID_AUTH),
      })
    );
  });
  it("CANNOT update with an invalid username", async () => {
    await firebase.assertFails(
      Promise.all(
        invalidUsernames.map((invalidUsername) =>
          updateDoc(
            MY_VALID_AUTH,
            "users",
            {
              ...getUpdateMetadata(MY_VALID_AUTH),
              username: invalidUsername,
            },
            MY_ID
          )
        )
      )
    );
  });
  it("CANNOT update with a username that already exists", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("handles")
      .doc(THEIR_USERNAME)
      .set({
        _documentType: "SlugDocument",
        ...getCreateMetadata(THEIR_VALID_AUTH, true),
        id: THEIR_ID,
      });

    const doc = {
      ...getUpdateMetadata(MY_VALID_AUTH),
      username: THEIR_USERNAME,
    };
    await firebase.assertFails(updateDoc(MY_VALID_AUTH, "users", doc, MY_ID));
  });
  it("CANNOT delete", async () => {
    await firebase.assertFails(deleteDoc(MY_VALID_AUTH, "users", MY_ID));
  });
  it("CANNOT update your bio if longer than 300 characters", async () => {
    const doc = {
      _documentType: "UserDocument",
      ...getUpdateMetadata(MY_VALID_AUTH),
      bio: "This is a bioLorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse ac pretium felis. Sed ut ligula id felis rhoncus pharetra vitae vitae neque. Nullam eget tortor eu diam bibendum efficitur sed quis quam. Donec commodo arcu ante, in gravida arcu convallis non. Praesent in odio id quam dapibus nam1.",
    };
    await firebase.assertFails(updateDoc(MY_VALID_AUTH, "users", doc, MY_ID));
  });
  it("CANNOT update your bio if not a string", async () => {
    const boolDoc = {
      _documentType: "UserDocument",
      ...getUpdateMetadata(MY_VALID_AUTH),
      bio: false,
    };
    await firebase.assertFails(
      updateDoc(MY_VALID_AUTH, "users", boolDoc, MY_ID)
    );
    const intDoc = {
      _documentType: "UserDocument",
      ...getUpdateMetadata(MY_VALID_AUTH),
      bio: 1,
    };
    await firebase.assertFails(
      updateDoc(MY_VALID_AUTH, "users", intDoc, MY_ID)
    );
    const objectDoc = {
      _documentType: "UserDocument",
      ...getUpdateMetadata(MY_VALID_AUTH),
      bio: new Object(),
    };
    await firebase.assertFails(
      updateDoc(MY_VALID_AUTH, "users", objectDoc, MY_ID)
    );
  });
};

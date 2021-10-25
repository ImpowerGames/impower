import * as firebase from "@firebase/rules-unit-testing";
import {
  MY_ID,
  MY_STUDIO_HANDLE,
  MY_STUDIO_ID,
  MY_VALID_AUTH,
  THEIR_ID,
  THEIR_STUDIO_HANDLE,
  THEIR_VALID_AUTH,
} from "../../constants";
import { getAdmin, getClient } from "../../utils";
import {
  createSubmissionDoc,
  getAdminServerTimestamp,
  getClientServerTimestamp,
  getCreateMetadata,
  getUpdateMetadata,
  setupSubmissionCounter,
} from "../utils";

export const testStudio = () => {
  const collection = "studios";
  const docId = MY_STUDIO_ID;
  const documentType = "StudioDocument";
  const name = "My Studio Name";
  const handle = "my_studio_handle";
  const tags = ["romance"];
  it("can get if you are the creator", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        delisted: false,
        published: false,
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(ref.get());
  });
  it("can get if you are an owner", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(THEIR_VALID_AUTH, true),
        _documentType: documentType,
        owners: [THEIR_ID, MY_ID],
        delisted: false,
        published: false,
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(ref.get());
  });
  it("can create with required fields", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .collection("submissions")
      .doc("studios")
      .set({
        _documentType: "PathDocument",
        ...getCreateMetadata(MY_VALID_AUTH, true),
      });

    const client = getClient(MY_VALID_AUTH);
    const submissionRef = client
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .collection("submissions")
      .doc("studios");
    const ref = client.firestore().collection(collection).doc(docId);
    const batch = client.firestore().batch();
    batch.update(submissionRef, {
      ...getUpdateMetadata(MY_VALID_AUTH),
      path: ref.path,
    });
    batch.set(ref, {
      ...getCreateMetadata(MY_VALID_AUTH),
      _documentType: documentType,
      owners: [MY_ID],
      name,
      handle: MY_STUDIO_HANDLE,
      delisted: false,
      published: false,
    });
    await firebase.assertSucceeds(batch.commit());
  });
  it("can create with all fields", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .collection("submissions")
      .doc("studios")
      .set({
        _documentType: "PathDocument",
        ...getCreateMetadata(MY_VALID_AUTH, true),
      });

    const client = getClient(MY_VALID_AUTH);
    const submissionRef = client
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .collection("submissions")
      .doc(collection);
    const ref = client.firestore().collection(collection).doc(docId);
    const batch = client.firestore().batch();
    batch.update(submissionRef, {
      ...getUpdateMetadata(MY_VALID_AUTH),
      path: ref.path,
    });
    batch.set(ref, {
      _documentType: documentType,
      ...getCreateMetadata(MY_VALID_AUTH),
      owners: [MY_ID],
      name,
      handle: MY_STUDIO_HANDLE,
      delisted: false,
      published: true,
      publishedAt: firebase.firestore.FieldValue.serverTimestamp(),
      republishedAt: firebase.firestore.FieldValue.serverTimestamp(),
      summary: "This is my studio",
      description: "Some more information about my studio",
      tags,
      icon: { fileUrl: "https://images.com/my_icon" },
      cover: { fileUrl: "https://images.com/my_cover" },
      logo: { fileUrl: "https://images.com/my_logo" },
      logoAlignment: "bottom_right",
      patternScale: 0.5,
      hex: "#FFFFFF",
      backgroundHex: "#FFFFFF",
      status: "inactive",
      statusInformation: "Currently taking a break",
      neededRoles: ["artist"],
    });
    await firebase.assertSucceeds(batch.commit());
  });
  it("can update if you are an owner", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name,
        handle: MY_STUDIO_HANDLE,
        delisted: false,
        published: false,
      });

    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(
      ref.update({
        ...getUpdateMetadata(MY_VALID_AUTH),
      })
    );
  });
  it("can delete if you are an owner", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name,
        handle: MY_STUDIO_HANDLE,
        delisted: false,
        published: false,
      });

    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(ref.delete());
  });
  it("can publish a new studio", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .collection("submissions")
      .doc("studios")
      .set({
        _documentType: "PathDocument",
        ...getCreateMetadata(MY_VALID_AUTH, true),
      });

    const client = getClient(MY_VALID_AUTH);
    const submissionRef = client
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .collection("submissions")
      .doc("studios");
    const ref = client.firestore().collection(collection).doc(docId);
    const batch = client.firestore().batch();
    batch.update(submissionRef, {
      ...getUpdateMetadata(MY_VALID_AUTH),
      path: ref.path,
    });
    batch.set(ref, {
      ...getCreateMetadata(MY_VALID_AUTH),
      _documentType: documentType,
      owners: [MY_ID],
      name,
      handle: MY_STUDIO_HANDLE,
      delisted: false,
      published: true,
    });
    await firebase.assertSucceeds(batch.commit());
  });
  it("can publish an existing studio", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name,
        handle: MY_STUDIO_HANDLE,
        delisted: false,
        published: true,
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(
      ref.update({
        ...getUpdateMetadata(MY_VALID_AUTH),
        published: true,
        publishedAt: getClientServerTimestamp(),
      })
    );
  });
  it("can republish an existing studio", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name,
        handle,
        tags,
        delisted: false,
        published: false,
        publishedAt: getAdminServerTimestamp(),
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(
      ref.update({
        ...getUpdateMetadata(MY_VALID_AUTH),
        published: true,
        republishedAt: getClientServerTimestamp(),
      })
    );
  });
  it("can delist after publishing", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name,
        handle,
        tags,
        delisted: false,
        published: true,
        publishedAt: getAdminServerTimestamp(),
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(
      ref.update({ ...getUpdateMetadata(MY_VALID_AUTH), delisted: true })
    );
  });
  it("CANNOT list", async () => {
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).limit(1);
    await firebase.assertFails(ref.get());
  });
  it("CANNOT create with restricted or unrecognized fields", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .collection("submissions")
      .doc("studios")
      .set({
        _documentType: "PathDocument",
        ...getCreateMetadata(MY_VALID_AUTH, true),
      });

    const client = getClient(MY_VALID_AUTH);
    const submissionRef = client
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .collection("submissions")
      .doc("studios");
    const ref = client.firestore().collection(collection).doc(docId);
    const batch = client.firestore().batch();
    batch.update(submissionRef, {
      ...getUpdateMetadata(MY_VALID_AUTH),
      path: ref.path,
    });
    batch.set(ref, {
      _documentType: documentType,
      ...getCreateMetadata(MY_VALID_AUTH),
      owners: [MY_ID],
      name,
      handle: MY_STUDIO_HANDLE,
      delisted: false,
      published: false,
      plan: "pro",
    });
    await firebase.assertFails(batch.commit());
  });
  it("CANNOT create with a handle that already exists", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("handles")
      .doc(THEIR_STUDIO_HANDLE)
      .set({
        ...getCreateMetadata(THEIR_VALID_AUTH, true),
        _documentType: "SlugDocument",
        id: THEIR_ID,
      });

    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(MY_ID);
    await firebase.assertFails(
      ref.set({
        _documentType: "UserDocument",
        ...getCreateMetadata(MY_VALID_AUTH),
        owners: [MY_ID],
        name,
        handle: THEIR_STUDIO_HANDLE,
      })
    );
  });
  it("CANNOT create more than 100 in a day", async () => {
    const doc = {
      _documentType: documentType,
      ...getCreateMetadata(MY_VALID_AUTH),
      owners: [MY_ID],
      name,
      handle: MY_STUDIO_HANDLE,
      delisted: false,
      published: false,
    };
    await setupSubmissionCounter("studios", 99);
    await firebase.assertSucceeds(
      createSubmissionDoc(MY_VALID_AUTH, "studios", "studios", doc)
    );
    await firebase.assertFails(
      createSubmissionDoc(MY_VALID_AUTH, "studios", "studios", doc)
    );
  });
  it("CANNOT update if does not have claim", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        delisted: false,
        published: false,
      });

    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertFails(
      ref.update({
        ...getUpdateMetadata(MY_VALID_AUTH),
      })
    );
  });
  it("CANNOT update if you are not an owner", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [THEIR_ID],
        name,
        handle: MY_STUDIO_HANDLE,
        delisted: false,
        published: false,
      });
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        delisted: false,
        published: false,
      });

    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .firestore()
        .collection(collection)
        .doc(docId)
        .update({
          ...getUpdateMetadata(MY_VALID_AUTH),
        })
    );
  });
  it("CANNOT update more than 100 times in a day", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true, 99),
        _documentType: documentType,
        owners: [MY_ID],
        name,
        handle: MY_STUDIO_HANDLE,
        delisted: false,
        published: false,
      });

    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
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
  it("CANNOT delete if you are not an owner", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [THEIR_ID],
        name,
        handle: MY_STUDIO_HANDLE,
        delisted: false,
        published: false,
      });

    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertFails(ref.delete());
  });
};

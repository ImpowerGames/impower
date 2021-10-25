import * as firebase from "@firebase/rules-unit-testing";
import {
  MY_ID,
  MY_STUDIO_HANDLE,
  MY_STUDIO_ID,
  MY_VALID_AUTH,
  THEIR_ID,
  THEIR_STUDIO_HANDLE,
  THEIR_STUDIO_ID,
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

export const testProject = (
  collection: "resources" | "games",
  docId: string
) => {
  const documentType =
    collection === "resources" ? "ResourceDocument" : "GameDocument";
  it("can get if you are the creator", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        _documentType: documentType,
        ...getCreateMetadata(MY_VALID_AUTH, true),
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
        _documentType: documentType,
        ...getCreateMetadata(THEIR_VALID_AUTH, true),
        owners: [THEIR_ID, MY_ID],
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(ref.get());
  });
  it("can get if you are the studio owner", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        _documentType: documentType,
        ...getCreateMetadata(THEIR_VALID_AUTH, true),
        studio: THEIR_STUDIO_ID,
        owners: [THEIR_ID],
      });
    await admin
      .firestore()
      .collection("studios")
      .doc(THEIR_STUDIO_ID)
      .set({
        _documentType: "StudioDocument",
        ...getCreateMetadata(THEIR_VALID_AUTH, true),
        owners: [THEIR_ID, MY_ID],
        delisted: false,
        published: false,
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(ref.get());
  });
  it("can create with required fields if no studio owner", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .collection("submissions")
      .doc(collection)
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
      name: "My Project Name",
      slug: "my_project_name",
      tags: ["romance"],
      delisted: false,
      published: false,
      pitched: false,
    });
    await firebase.assertSucceeds(batch.commit());
  });
  it("can create with all fields if you are an owner", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .collection("submissions")
      .doc(collection)
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
      name: "My Project Name",
      slug: "my_project_name",
      delisted: false,
      published: false,
      pitched: false,
      publishedAt: firebase.firestore.FieldValue.serverTimestamp(),
      republishedAt: firebase.firestore.FieldValue.serverTimestamp(),
      summary: "This is my project",
      description: "Some more information about my project",
      tags: ["romance"],
      icon: { fileUrl: "https://images.com/my_icon" },
      cover: { fileUrl: "https://images.com/my_cover" },
      logo: { fileUrl: "https://images.com/my_logo" },
      logoAlignment: "bottom_right",
      patternScale: 0.5,
      hex: "#FFFFFF",
      backgroundHex: "#FFFFFF",
      status: "in_development",
      statusInformation: "Currently taking a break",
    });
    await firebase.assertSucceeds(batch.commit());
  });
  it("can create if you are not the project owner but are one of the studio's owners", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("studios")
      .doc(MY_STUDIO_ID)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: "StudioDocument",
        owners: [MY_ID],
        name: "My Studio Name",
        handle: MY_STUDIO_HANDLE,
        delisted: false,
        published: false,
      });
    await admin
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .collection("submissions")
      .doc(collection)
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
      name: "My Project Name",
      slug: "my_project_name",
      tags: ["romance"],
      studio: MY_STUDIO_ID,
      delisted: false,
      published: false,
      pitched: false,
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
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        published: false,
        pitched: false,
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(
      ref.update({
        ...getUpdateMetadata(MY_VALID_AUTH),
      })
    );
  });
  it("can update if you are the studio owner", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("studios")
      .doc(THEIR_STUDIO_ID)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: "StudioDocument",
        owners: [THEIR_ID, MY_ID],
        name: "Their Studio Name",
        handle: THEIR_STUDIO_HANDLE,
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
        owners: [MY_ID],
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        studio: THEIR_STUDIO_ID,
        delisted: false,
        published: false,
        pitched: false,
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
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        published: false,
        pitched: false,
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(ref.delete());
  });
  it("can pitch a new project", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .collection("submissions")
      .doc(collection)
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
      name: "My Project Name",
      slug: "my_project_name",
      tags: ["romance"],
      delisted: false,
      published: false,
      pitched: true,
      pitchedAt: getClientServerTimestamp(),
    });
    await firebase.assertSucceeds(batch.commit());
  });
  it("can pitch an existing project", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        published: false,
        pitched: false,
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(
      ref.update({
        ...getUpdateMetadata(MY_VALID_AUTH),
        pitched: true,
        pitchedAt: getClientServerTimestamp(),
      })
    );
  });
  it("can delist after pitching", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        published: false,
        pitched: true,
        pitchedAt: getAdminServerTimestamp(),
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(
      ref.update({ ...getUpdateMetadata(MY_VALID_AUTH), delisted: true })
    );
  });
  it("can publish a new project", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .collection("submissions")
      .doc(collection)
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
      name: "My Project Name",
      slug: "my_project_name",
      tags: ["romance"],
      delisted: false,
      published: true,
      pitched: false,
      publishedAt: getClientServerTimestamp(),
    });
    await firebase.assertSucceeds(batch.commit());
  });
  it("can publish an existing project", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        published: false,
        pitched: false,
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
  it("can republish an existing project", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        published: false,
        pitched: false,
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
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        published: true,
        pitched: false,
        publishedAt: getAdminServerTimestamp(),
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(
      ref.update({ ...getUpdateMetadata(MY_VALID_AUTH), delisted: true })
    );
  });
  it("can unpitch after pitching", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        published: false,
        pitched: true,
        pitchedAt: getAdminServerTimestamp(),
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(
      ref.update({
        ...getUpdateMetadata(MY_VALID_AUTH),
        pitched: false,
      })
    );
  });
  it("CANNOT update pitchedAt after pitching", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        published: false,
        pitched: true,
        pitchedAt: getAdminServerTimestamp(),
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertFails(
      ref.update({
        ...getUpdateMetadata(MY_VALID_AUTH),
        pitched: true,
        pitchedAt: getClientServerTimestamp(),
      })
    );
  });
  it("CANNOT pitch after unpitching", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        published: false,
        pitched: false,
        pitchedAt: getAdminServerTimestamp(),
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertFails(
      ref.update({
        ...getUpdateMetadata(MY_VALID_AUTH),
        pitched: true,
        pitchedAt: getClientServerTimestamp(),
      })
    );
  });
  it("can unpublished after publishing", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        published: true,
        pitched: false,
        publishedAt: getAdminServerTimestamp(),
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertSucceeds(
      ref.update({
        ...getUpdateMetadata(MY_VALID_AUTH),
        published: false,
      })
    );
  });
  it("CANNOT update publishedAt after publishing", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        published: true,
        pitched: false,
        publishedAt: getAdminServerTimestamp(),
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertFails(
      ref.update({
        ...getUpdateMetadata(MY_VALID_AUTH),
        published: true,
        publishedAt: getClientServerTimestamp(),
      })
    );
  });
  it("CANNOT publish after unpublishing", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        published: false,
        pitched: false,
        publishedAt: getAdminServerTimestamp(),
      });
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertFails(
      ref.update({
        ...getUpdateMetadata(MY_VALID_AUTH),
        published: true,
        publishedAt: getClientServerTimestamp(),
      })
    );
  });
  it("CANNOT create if you are not a project owner and not one of the studio's owner", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("studios")
      .doc(THEIR_STUDIO_ID)
      .set({
        ...getCreateMetadata(THEIR_VALID_AUTH, true),
        _documentType: "StudioDocument",
        owners: [THEIR_ID],
        name: "Their Studio Name",
        handle: THEIR_STUDIO_HANDLE,
        delisted: false,
        published: false,
      });
    await admin
      .firestore()
      .collection("users")
      .doc(MY_ID)
      .collection("submissions")
      .doc(collection)
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
      name: "My Project Name",
      slug: "my_project_name",
      tags: ["romance"],
      studio: THEIR_STUDIO_ID,
      delisted: false,
      published: false,
      pitched: false,
    });
    await firebase.assertFails(batch.commit());
  });
  it("CANNOT get if is not a member", async () => {
    const client = getClient(MY_VALID_AUTH);
    const ref = client.firestore().collection(collection).doc(docId);
    await firebase.assertFails(ref.get());
  });
  it("CANNOT list", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: documentType,
        owners: [MY_ID],
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        published: false,
        pitched: false,
      });
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
      .doc(collection)
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
      name: "My Project Name",
      slug: "my_project_slug",
      tags: ["romance"],
      delisted: false,
      pitched: false,
      published: false,
      plan: "pro",
    });
    await firebase.assertFails(batch.commit());
  });
  it("CANNOT create more than 100 in a day", async () => {
    const doc = {
      _documentType: documentType,
      ...getCreateMetadata(MY_VALID_AUTH),
      owners: [MY_ID],
      name: "My Project Name",
      slug: "my_project_slug",
      tags: ["romance"],
      delisted: false,
      pitched: false,
      published: false,
    };
    await setupSubmissionCounter(collection, 99);
    await firebase.assertSucceeds(
      createSubmissionDoc(MY_VALID_AUTH, collection, collection, doc)
    );
    await firebase.assertFails(
      createSubmissionDoc(MY_VALID_AUTH, collection, collection, doc)
    );
  });
  it("CANNOT update if does not have claim", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        _documentType: documentType,
        ...getCreateMetadata(MY_VALID_AUTH, true),
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
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        pitched: false,
        published: false,
      });
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        _documentType: documentType,
        ...getCreateMetadata(MY_VALID_AUTH, true),
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
  it("CANNOT update if you are not an owner and not the studio owner", async () => {
    const admin = getAdmin();
    await admin
      .firestore()
      .collection("studios")
      .doc(THEIR_STUDIO_ID)
      .set({
        ...getCreateMetadata(MY_VALID_AUTH, true),
        _documentType: "StudioDocument",
        owners: [THEIR_ID],
        name: "Their Studio Name",
        handle: THEIR_STUDIO_HANDLE,
        delisted: false,
        published: false,
      });
    await admin
      .firestore()
      .collection(collection)
      .doc(docId)
      .set({
        ...getCreateMetadata(THEIR_VALID_AUTH, true),
        _documentType: documentType,
        owners: [THEIR_ID],
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        studio: THEIR_STUDIO_ID,
        delisted: false,
        pitched: false,
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
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        pitched: false,
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
        name: "My Project Name",
        slug: "my_project_slug",
        tags: ["romance"],
        delisted: false,
        pitched: false,
        published: false,
      });

    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client.firestore().collection(collection).doc(docId).delete()
    );
  });
};

import * as firebase from "@firebase/rules-unit-testing";
import { MY_VALID_AUTH, MY_ID, THEIR_ID } from "../../constants";
import { getClient, getAdmin } from "../../utils";
import { getClientServerTimestamp } from "../utils";

export const testOwners = (
  group: string,
  docId: string,
  collection: "members",
  ownerAccess: "owner"
) => {
  const docPath = `${group}/${docId}`;
  it(`can read member`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertSucceeds(
      client.database().ref(`${docPath}/${collection}/data/${THEIR_ID}`).get()
    );
  });
  const indexedFields = ["t", "access", "role", "accessedAt"];
  indexedFields.forEach((field) => {
    it(`can list ordered by ${field}`, async () => {
      const admin = getAdmin();
      await admin
        .database()
        .ref()
        .child(`${docPath}/${collection}/data/${MY_ID}`)
        .set({
          t: getClientServerTimestamp(),
          access: ownerAccess,
          g: group,
          role: "",
        });
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${docPath}/${collection}/data`)
          .orderByChild(field)
          .get()
      );
    });
  });
  it(`can write if updating accessedAt`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertSucceeds(
      client.database().ref(`${docPath}/${collection}/data/${MY_ID}`).update({
        accessedAt: getClientServerTimestamp(),
      })
    );
  });
  it(`can write if adding viewer`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertSucceeds(
      client.database().ref(`${docPath}/${collection}/data/${THEIR_ID}`).set({
        t: getClientServerTimestamp(),
        access: "viewer",
        g: group,
        role: "",
      })
    );
  });
  it(`can write if adding editor`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertSucceeds(
      client.database().ref(`${docPath}/${collection}/data/${THEIR_ID}`).set({
        t: getClientServerTimestamp(),
        access: "editor",
        g: group,
        role: "",
      })
    );
  });
  it(`can write if removing viewer`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "viewer",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertSucceeds(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .remove()
    );
  });
  it(`can write if removing editor`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "editor",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertSucceeds(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .remove()
    );
  });
  it(`can write if changing viewer to editor`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "viewer",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertSucceeds(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .update({ access: "editor" })
    );
  });
  it(`can write if changing editor to viewer`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "editor",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertSucceeds(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .update({ access: "viewer" })
    );
  });
  it(`can write if changing viewer role`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "viewer",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertSucceeds(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .update({ role: "Developer" })
    );
  });
  it(`can write if changing editor role`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "editor",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertSucceeds(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .update({ role: "Developer" })
    );
  });
  it(`can write if changing owner role`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "owner",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertSucceeds(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .update({ role: "Developer" })
    );
  });
  it(`CANNOT write if adding owner`, async () => {
    // Owners can only be changed in the firestore doc's "owners" array
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client.database().ref(`${docPath}/${collection}/data/${THEIR_ID}`).set({
        t: getClientServerTimestamp(),
        access: "owner",
        g: group,
        role: "",
      })
    );
  });
  it(`CANNOT write if adding self`, async () => {
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client.database().ref(`${docPath}/${collection}/data/${MY_ID}`).set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      })
    );
  });
  it(`CANNOT write if removing owner`, async () => {
    // Owners can only be changed in the firestore doc's "owners" array
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .remove()
    );
  });
  it(`CANNOT write if removing self`, async () => {
    // Owners can only be changed in the firestore doc's "owners" array
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client.database().ref(`${docPath}/${collection}/data/${MY_ID}`).remove()
    );
  });
  it(`CANNOT write if changing owner to editor`, async () => {
    // Owners can only be changed in the firestore doc's "owners" array
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .update({ access: "editor" })
    );
  });
  it(`CANNOT write if changing owner to viewer`, async () => {
    // Owners can only be changed in the firestore doc's "owners" array
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .update({ access: "viewer" })
    );
  });
  it(`CANNOT write if changing self to owner`, async () => {
    // Owners can only be changed in the firestore doc's "owners" array
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${MY_ID}`)
        .update({ access: "owner" })
    );
  });
  it(`CANNOT write if changing self to editor`, async () => {
    // Owners can only be changed in the firestore doc's "owners" array
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${MY_ID}`)
        .update({ access: "editor" })
    );
  });
  it(`CANNOT write if changing self to viewer`, async () => {
    // Owners can only be changed in the firestore doc's "owners" array
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${MY_ID}`)
        .update({ access: "viewer" })
    );
  });
  it(`CANNOT write if updating t`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: ownerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client.database().ref(`${docPath}/${collection}/data/${MY_ID}`).update({
        t: getClientServerTimestamp(),
      })
    );
  });
};

export const testNonOwners = (
  group: string,
  docId: string,
  collection: "members",
  nonOwnerAccess: "viewer" | "editor"
) => {
  const docPath = `${group}/${docId}`;
  it(`can read member`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertSucceeds(
      client.database().ref(`${docPath}/${collection}/data/${THEIR_ID}`).get()
    );
  });
  const indexedFields = ["t", "access", "role", "accessedAt"];
  indexedFields.forEach((field) => {
    it(`can list ordered by ${field}`, async () => {
      const admin = getAdmin();
      await admin
        .database()
        .ref()
        .child(`${docPath}/${collection}/data/${MY_ID}`)
        .set({
          t: getClientServerTimestamp(),
          access: nonOwnerAccess,
          g: group,
          role: "",
        });
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${docPath}/${collection}/data`)
          .orderByChild(field)
          .get()
      );
    });
  });
  it(`can write if updating accessedAt`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertSucceeds(
      client.database().ref(`${docPath}/${collection}/data/${MY_ID}`).update({
        accessedAt: getClientServerTimestamp(),
      })
    );
  });
  it(`CANNOT write if changing role`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${MY_ID}`)
        .update({ role: "Developer" })
    );
  });
  it(`CANNOT write if adding viewer`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client.database().ref(`${docPath}/${collection}/data/${THEIR_ID}`).set({
        t: getClientServerTimestamp(),
        access: "viewer",
        g: group,
        role: "",
      })
    );
  });
  it(`CANNOT write if adding editor`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client.database().ref(`${docPath}/${collection}/data/${THEIR_ID}`).set({
        t: getClientServerTimestamp(),
        access: "editor",
        g: group,
        role: "",
      })
    );
  });
  it(`CANNOT write if adding owner`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client.database().ref(`${docPath}/${collection}/data/${THEIR_ID}`).set({
        t: getClientServerTimestamp(),
        access: "owner",
        g: group,
        role: "",
      })
    );
  });
  it(`CANNOT write if adding self`, async () => {
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client.database().ref(`${docPath}/${collection}/data/${MY_ID}`).set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      })
    );
  });
  it(`CANNOT write if removing viewer`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "viewer",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .remove()
    );
  });
  it(`CANNOT write if removing editor`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "editor",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .remove()
    );
  });
  it(`CANNOT write if removing owner`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "owner",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .remove()
    );
  });
  it(`CANNOT write if removing self`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client.database().ref(`${docPath}/${collection}/data/${MY_ID}`).remove()
    );
  });
  it(`CANNOT write if changing editor to viewer`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "editor",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .update({ access: "viewer" })
    );
  });
  it(`CANNOT write if changing editor to owner`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "editor",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .update({ access: "owner" })
    );
  });
  it(`CANNOT write if changing viewer to editor`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "viewer",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .update({ access: "editor" })
    );
  });
  it(`CANNOT write if changing viewer to owner`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "viewer",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .update({ access: "owner" })
    );
  });
  it(`CANNOT write if changing owner to editor`, async () => {
    // Owners can only be changed in the firestore doc's "owners" array
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "owner",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .update({ access: "editor" })
    );
  });
  it(`CANNOT write if changing owner to viewer`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${THEIR_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: "owner",
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${THEIR_ID}`)
        .update({ access: "viewer" })
    );
  });
  it(`CANNOT write if changing self to editor`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${MY_ID}`)
        .update({ access: "editor" })
    );
  });
  it(`CANNOT write if changing self to viewer`, async () => {
    const admin = getAdmin();
    await admin
      .database()
      .ref()
      .child(`${docPath}/${collection}/data/${MY_ID}`)
      .set({
        t: getClientServerTimestamp(),
        access: nonOwnerAccess,
        g: group,
        role: "",
      });
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertFails(
      client
        .database()
        .ref(`${docPath}/${collection}/data/${MY_ID}`)
        .update({ access: "viewer" })
    );
  });
};

export const testMembers = (
  group: string,
  docId: string,
  collection: "members"
) => {
  it("can read self", async () => {
    const client = getClient(MY_VALID_AUTH);
    await firebase.assertSucceeds(
      client
        .database()
        .ref(`${group}/${docId}/${collection}/data/${MY_ID}`)
        .get()
    );
  });
  describe("owners", () => {
    testOwners(group, docId, collection, "owner");
  });
  describe("editors", () => {
    testNonOwners(group, docId, collection, "editor");
  });
  describe("viewers", () => {
    testNonOwners(group, docId, collection, "viewer");
  });
};

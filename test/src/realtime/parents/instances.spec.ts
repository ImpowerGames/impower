import * as firebase from "@firebase/rules-unit-testing";
import { MY_VALID_AUTH, MY_ID, CHILD_ID, MY_STUDIO_ID } from "../../constants";
import { getAdmin, getClient } from "../../utils";
import { getClientServerTimestamp } from "../utils";

export const testInstances = (
  group: string,
  id: string,
  instanceCollection: "files" | "folders" | "configs" | "constructs" | "blocks"
) => {
  const docPath = `${group}/${id}`;
  describe(instanceCollection, () => {
    it("can read if you are a member", async () => {
      const admin = getAdmin();
      await admin
        .database()
        .ref()
        .child(`${docPath}/members/data/${MY_ID}`)
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
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .get()
      );
    });
    it("can read if you are not a member, but you are one of the studio's owners", async () => {
      const admin = getAdmin();
      await admin
        .database()
        .ref()
        .child(`studios/${MY_STUDIO_ID}/members/data/${MY_ID}`)
        .set({
          t: getClientServerTimestamp(),
          access: "owner",
          g: group,
          role: "",
        });
      await admin.database().ref().child(`${docPath}/doc`).set({
        studio: MY_STUDIO_ID,
        restricted: true,
      });
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .get()
      );
    });
    it("can read if you are not a member, but you are one of the studio's members, and the project is not restricted", async () => {
      const admin = getAdmin();
      await admin
        .database()
        .ref()
        .child(`studios/${MY_STUDIO_ID}/members/data/${MY_ID}`)
        .set({
          t: getClientServerTimestamp(),
          access: "viewer",
          g: group,
          role: "",
        });
      await admin.database().ref().child(`${docPath}/doc`).set({
        studio: MY_STUDIO_ID,
        restricted: false,
      });
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .get()
      );
    });
    it("can write if you are an editor", async () => {
      const admin = getAdmin();
      await admin
        .database()
        .ref()
        .child(`${docPath}/members/data/${MY_ID}`)
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
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .set({ name: "New Name" })
      );
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .update({ name: "New Name" })
      );
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .remove()
      );
    });
    it("can write if you are an owner", async () => {
      const admin = getAdmin();
      await admin
        .database()
        .ref()
        .child(`${docPath}/members/data/${MY_ID}`)
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
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .set({ name: "New Name" })
      );
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .update({ name: "New Name" })
      );
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .remove()
      );
    });
    it("can write if you are not a member, but you are one of the studio's owners", async () => {
      const admin = getAdmin();
      await admin
        .database()
        .ref()
        .child(`studios/${MY_STUDIO_ID}/members/data/${MY_ID}`)
        .set({
          t: getClientServerTimestamp(),
          access: "owner",
          g: group,
          role: "",
        });
      await admin.database().ref().child(`${docPath}/doc`).set({
        studio: MY_STUDIO_ID,
        restricted: true,
      });
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .set({ name: "New Name" })
      );
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .update({ name: "New Name" })
      );
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .remove()
      );
    });
    it("can write if you are not a member, but you are one of the studio's members and the project is not restricted", async () => {
      const admin = getAdmin();
      await admin
        .database()
        .ref()
        .child(`studios/${MY_STUDIO_ID}/members/data/${MY_ID}`)
        .set({
          t: getClientServerTimestamp(),
          access: "editor",
          g: group,
          role: "",
        });
      await admin.database().ref().child(`${docPath}/doc`).set({
        studio: MY_STUDIO_ID,
        restricted: false,
      });
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .set({ name: "New Name" })
      );
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .update({ name: "New Name" })
      );
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .remove()
      );
    });
    it("CANNOT write if you are not a member, but you are one of the studio's members and the project is restricted", async () => {
      const admin = getAdmin();
      await admin
        .database()
        .ref()
        .child(`studios/${MY_STUDIO_ID}/members/data/${MY_ID}`)
        .set({
          t: getClientServerTimestamp(),
          access: "editor",
          g: group,
          role: "",
        });
      await admin.database().ref().child(`${docPath}/doc`).set({
        studio: MY_STUDIO_ID,
        restricted: true,
      });
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertFails(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .set({ name: "New Name" })
      );
      await firebase.assertFails(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .update({ name: "New Name" })
      );
      await firebase.assertFails(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .remove()
      );
    });
    it("CANNOT read if you not a member", async () => {
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertFails(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .get()
      );
    });
    it("CANNOT write if you are not a member", async () => {
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertFails(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .set({ name: "New Name" })
      );
    });
    it("CANNOT write if you are a viewer", async () => {
      const admin = getAdmin();
      await admin
        .database()
        .ref()
        .child(`${docPath}/members/data/${MY_ID}`)
        .set({ access: "viewer" });
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertFails(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .set({ name: "New Name" })
      );
    });
    it("CANNOT read if you are not a member and you are one of the studio's members, but the project is restricted", async () => {
      const admin = getAdmin();
      await admin
        .database()
        .ref()
        .child(`studios/${MY_STUDIO_ID}/members/data/${MY_ID}`)
        .set({
          t: getClientServerTimestamp(),
          access: "viewer",
          g: group,
          role: "",
        });
      await admin.database().ref().child(`${docPath}/doc`).set({
        studio: MY_STUDIO_ID,
        restricted: true,
      });
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertFails(
        client
          .database()
          .ref(`${docPath}/instances/${instanceCollection}/data/${CHILD_ID}`)
          .get()
      );
    });
  });
};

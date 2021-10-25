import * as firebase from "@firebase/rules-unit-testing";
import * as fs from "fs";
import { FILE_ID } from "../constants";
import { clearBefore, clearBeforeEach, getAdmin } from "../utils";
import {
  getTestFileBuffer,
  downloadFile,
  getMetadata,
  uploadFile,
  deleteFile,
  updateMetadata,
  softDeleteFile,
  getTodayStorageKey,
} from "./utils";

process.env.FIREBASE_STORAGE_EMULATOR_HOST = "localhost:9199";

(global as any).XMLHttpRequest = require("xhr2");

before(async () => {
  await firebase.loadStorageRules({
    rules: fs.readFileSync("../server/storage.rules", "utf8"),
  });
  await clearBefore();
});

beforeEach(async () => {
  await clearBeforeEach();
});

describe("storage", () => {
  describe("users", () => {
    it("can read", async () => {
      const key = getTodayStorageKey(new Date(), FILE_ID);
      const admin = getAdmin();
      await admin
        .storage()
        .bucket()
        .file(key)
        .save(getTestFileBuffer(5 * 1000000));
      await firebase.assertSucceeds(downloadFile(key));
      await firebase.assertSucceeds(getMetadata(key));
    }).timeout(10000);
    it("can create", async () => {
      const key = getTodayStorageKey(new Date(), FILE_ID);
      const file = getTestFileBuffer(5 * 1000000);
      await firebase.assertSucceeds(uploadFile(key, file));
    }).timeout(10000);
    it("can soft delete", async () => {
      const key = getTodayStorageKey(new Date(2021, 1, 1), FILE_ID);
      const admin = getAdmin();
      await admin
        .storage()
        .bucket()
        .file(key)
        .save(getTestFileBuffer(5 * 1000000));
      await firebase.assertSucceeds(softDeleteFile(key));
    }).timeout(10000);
    it("CANNOT create if not creating in today's folder", async () => {
      const key = getTodayStorageKey(new Date(2021, 1, 1), FILE_ID);
      const file = getTestFileBuffer(5 * 1000000);
      await firebase.assertFails(uploadFile(key, file));
    }).timeout(10000);
    it("CANNOT read soft deleted file", async () => {
      const key = getTodayStorageKey(new Date(2021, 1, 1), FILE_ID);
      const admin = getAdmin();
      await admin
        .storage()
        .bucket()
        .file(key)
        .save(getTestFileBuffer(5 * 1000000));
      await firebase.assertSucceeds(softDeleteFile(key));
      await firebase.assertFails(downloadFile(key));
    }).timeout(10000);
    it("CANNOT hard delete", async () => {
      const key = getTodayStorageKey(new Date(), FILE_ID);
      await firebase.assertFails(deleteFile(key));
    }).timeout(10000);
    it("CANNOT create if file size is over 10mb", async () => {
      const key = getTodayStorageKey(new Date(), FILE_ID);
      const file = getTestFileBuffer(11 * 1000000);
      await firebase.assertFails(uploadFile(key, file));
    }).timeout(10000);
    it("CANNOT create if file if id is not a 3 digit number", async () => {
      const file = getTestFileBuffer(5 * 1000000);
      await firebase.assertFails(
        uploadFile(getTodayStorageKey(new Date(), "0000"), file)
      );
      await firebase.assertFails(
        uploadFile(getTodayStorageKey(new Date(), "0"), file)
      );
      await firebase.assertFails(
        uploadFile(getTodayStorageKey(new Date(), "abc"), file)
      );
    }).timeout(10000);
    it("CANNOT update a file's metadata", async () => {
      const key = getTodayStorageKey(new Date(), FILE_ID);
      const admin = getAdmin();
      await admin
        .storage()
        .bucket()
        .file(key)
        .save(getTestFileBuffer(5 * 1000000));
      await firebase.assertFails(
        updateMetadata(key, {
          customMetadata: { deleted: new Date().toJSON() },
        })
      );
    }).timeout(10000);
  });
});

import * as firebase from "@firebase/rules-unit-testing";
import * as fs from "fs";
import { DATABASE_NAME, PROJECT_ID } from "../constants";
import { clearBefore, clearBeforeEach } from "../utils";

process.env.FIREBASE_STORAGE_EMULATOR_HOST = "localhost:9199";

(global as any).XMLHttpRequest = require("xhr2");

before(async () => {
  await firebase.loadFirestoreRules({
    projectId: PROJECT_ID,
    rules: fs.readFileSync("../server/firestore.rules", "utf8"),
  });
  await firebase.loadDatabaseRules({
    databaseName: DATABASE_NAME,
    rules: fs.readFileSync("../server/database.rules.json", "utf8"),
  });
  await firebase.loadStorageRules({
    rules: fs.readFileSync("../server/storage.rules", "utf8"),
  });
  await clearBefore();
});

beforeEach(async () => {
  await clearBeforeEach();
});

describe("functions", () => {});

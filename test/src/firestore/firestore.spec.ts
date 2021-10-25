import * as firebase from "@firebase/rules-unit-testing";
import * as fs from "fs";
import {
  MY_STUDIO_ID,
  MY_GAME_ID,
  MY_RESOURCE_ID,
  MY_PROJECT_ID,
  PROJECT_ID,
} from "../constants";
import { testClaims } from "./collections/claims.spec";
import { testComments } from "./collections/comments.spec";
import { testContributions } from "./collections/contributions.spec";
import { testGroups } from "./collections/groups.spec";
import { testReports } from "./collections/reports.spec";
import { testSettings } from "./collections/settings.spec";
import { testSuggestions } from "./collections/suggestions.spec";
import { testHandle } from "./docs/handle.spec";
import { testPhrase } from "./docs/phrase.spec";
import { testProject } from "./docs/project.spec";
import { testSlug } from "./docs/slug.spec";
import { testStudio } from "./docs/studio.spec";
import { testTag } from "./docs/tag.spec";
import { testUser } from "./docs/user.spec";
import { clearBefore, clearBeforeEach } from "../utils";
import { testSubmissions } from "./collections/submissions.spec";
import { testCustomizations } from "./collections/customizations.spec";
import { testPublishedPage } from "./docs/published_page.spec";
import { testPitchedProject } from "./docs/pitched_project.spec";

process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";

before(async () => {
  await firebase.loadFirestoreRules({
    projectId: PROJECT_ID,
    rules: fs.readFileSync("../server/firestore.rules", "utf8"),
  });
  await clearBefore();
});

beforeEach(async () => {
  await clearBeforeEach();
});

describe("firestore", () => {
  testGroups();

  describe("handles", () => {
    testHandle();
  });

  describe("slugs", () => {
    testSlug();
  });

  describe("phrases", () => {
    testPhrase();

    testSuggestions("phrases");
  });

  describe("tags", () => {
    testTag();

    testReports("tags");
  });

  describe("users", () => {
    testUser();

    testReports("users");

    testSubmissions("users");

    testCustomizations("users");

    testSettings("users");

    testClaims("users");
  });

  describe("studios", () => {
    testStudio();
  });

  describe("resources", () => {
    testProject("resources", MY_PROJECT_ID);
  });

  describe("games", () => {
    testProject("games", MY_PROJECT_ID);
  });

  describe("published_studios", () => {
    testPublishedPage("published_studios", "StudioDocument");

    testReports("published_studios");

    testComments("published_studios", MY_STUDIO_ID);
  });

  describe("published_resources", () => {
    testPublishedPage("published_resources", "ResourceDocument");

    testReports("published_resources");

    testComments("published_resources", MY_RESOURCE_ID);
  });

  describe("published_games", () => {
    testPublishedPage("published_games", "GameDocument");

    testReports("published_games");

    testComments("published_games", MY_GAME_ID);
  });

  describe("pitched_resources", () => {
    testPitchedProject("pitched_resources", "ResourceDocument");

    testReports("pitched_resources");

    testContributions("pitched_resources", MY_RESOURCE_ID);
  });

  describe("pitched_games", () => {
    testPitchedProject("pitched_games", "GameDocument");

    testReports("pitched_games");

    testContributions("pitched_games", MY_GAME_ID);
  });
});

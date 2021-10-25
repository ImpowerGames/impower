import * as firebase from "@firebase/rules-unit-testing";
import * as fs from "fs";
import {
  DATABASE_NAME,
  MY_GAME_ID,
  MY_ID,
  MY_RESOURCE_ID,
  MY_STUDIO_ID,
  THEIR_ID,
} from "../constants";
import { clearBefore, clearBeforeEach } from "../utils";
import {
  testCountOnlyAggregations,
  testMetricAggregations,
  testMyAggregations,
  testWritableAggregations,
} from "./parents/aggregations.spec";
import { testDoc } from "./parents/doc.spec";
import { testInstances } from "./parents/instances.spec";
import { testMembers } from "./parents/members.spec";
import { testMessages } from "./parents/messages.spec";

process.env.FIREBASE_DATABASE_EMULATOR_HOST = "localhost:9000";

before(async () => {
  await firebase.loadDatabaseRules({
    databaseName: DATABASE_NAME,
    rules: fs.readFileSync("../server/database.rules.json", "utf8"),
  });
  await clearBefore();
});

beforeEach(async () => {
  await clearBeforeEach();
});

describe("realtime", () => {
  describe("phrases", () => {
    const path = `phrases/This is My Phrase`;
    describe("agg", () => {
      testMetricAggregations(path, "score");
      testMetricAggregations(path, "rating");
      testMetricAggregations(path, "rank");
      testWritableAggregations(path, "likes");
      testWritableAggregations(path, "dislikes");
      testCountOnlyAggregations(path, "suggestions");
    });
  });

  describe("messages", () => {
    const path = `messages/message_id`;
    testMessages(path);
  });

  describe("tags", () => {
    const path = `tags/example`;
    describe("agg", () => {
      testCountOnlyAggregations(path, "studios");
      testCountOnlyAggregations(path, "resources");
      testCountOnlyAggregations(path, "games");
      testWritableAggregations(path, "follows");
    });
  });

  describe("users", () => {
    const path = `users/${THEIR_ID}`;
    describe("agg", () => {
      testMyAggregations("my_submissions");
      testMyAggregations("my_memberships");
      testMyAggregations("my_follows");
      testMyAggregations("my_connects");
      testMyAggregations("my_kudos");
      testMyAggregations("my_likes");
      testMyAggregations("my_dislikes");
      testWritableAggregations(path, "follows");
      testWritableAggregations(path, "connects");
    });
  });

  describe("published_studios", () => {
    const path = `published_studios/${MY_STUDIO_ID}`;
    const commentPath = `published_studios/${MY_STUDIO_ID}/comments/${MY_ID}`;
    describe("agg", () => {
      testMetricAggregations(path, "score");
      testMetricAggregations(path, "rating");
      testMetricAggregations(path, "rank");
      testWritableAggregations(path, "likes");
      testWritableAggregations(path, "dislikes");
      testWritableAggregations(path, "kudos");
      testCountOnlyAggregations(path, "comments");
    });
    describe("comments", () => {
      describe("agg", () => {
        testMetricAggregations(commentPath, "score");
        testMetricAggregations(commentPath, "rating");
        testMetricAggregations(commentPath, "rank");
        testWritableAggregations(commentPath, "likes");
        testWritableAggregations(commentPath, "dislikes");
      });
    });
  });

  describe("published_resources", () => {
    const path = `published_resources/${MY_RESOURCE_ID}`;
    const commentPath = `published_resources/${MY_RESOURCE_ID}/comments/${MY_ID}`;
    describe("agg", () => {
      testMetricAggregations(path, "score");
      testMetricAggregations(path, "rating");
      testMetricAggregations(path, "rank");
      testWritableAggregations(path, "likes");
      testWritableAggregations(path, "dislikes");
      testWritableAggregations(path, "kudos");
      testCountOnlyAggregations(path, "comments");
    });
    describe("comments", () => {
      describe("agg", () => {
        testMetricAggregations(commentPath, "score");
        testMetricAggregations(commentPath, "rating");
        testMetricAggregations(commentPath, "rank");
        testWritableAggregations(commentPath, "likes");
        testWritableAggregations(commentPath, "dislikes");
      });
    });
  });

  describe("published_games", () => {
    const path = `published_games/${MY_GAME_ID}`;
    const commentPath = `published_games/${MY_GAME_ID}/comments/${MY_ID}`;
    describe("agg", () => {
      testMetricAggregations(path, "score");
      testMetricAggregations(path, "rating");
      testMetricAggregations(path, "rank");
      testWritableAggregations(path, "likes");
      testWritableAggregations(path, "dislikes");
      testWritableAggregations(path, "kudos");
      testCountOnlyAggregations(path, "comments");
    });
    describe("comments", () => {
      describe("agg", () => {
        testMetricAggregations(commentPath, "score");
        testMetricAggregations(commentPath, "rating");
        testMetricAggregations(commentPath, "rank");
        testWritableAggregations(commentPath, "likes");
        testWritableAggregations(commentPath, "dislikes");
      });
    });
  });

  describe("pitched_resources", () => {
    const path = `pitched_resources/${MY_RESOURCE_ID}`;
    const contributionPath = `pitched_resources/${MY_RESOURCE_ID}/contributions/${MY_ID}-story`;
    describe("agg", () => {
      testMetricAggregations(path, "score");
      testMetricAggregations(path, "rating");
      testMetricAggregations(path, "rank");
      testWritableAggregations(path, "likes");
      testWritableAggregations(path, "dislikes");
      testWritableAggregations(path, "kudos");
      testCountOnlyAggregations(path, "contributions");
    });
    describe("contributions", () => {
      describe("agg", () => {
        testMetricAggregations(contributionPath, "score");
        testMetricAggregations(contributionPath, "rating");
        testMetricAggregations(contributionPath, "rank");
        testWritableAggregations(contributionPath, "likes");
        testWritableAggregations(contributionPath, "dislikes");
        testWritableAggregations(contributionPath, "kudos");
      });
    });
  });

  describe("pitched_games", () => {
    const path = `pitched_games/${MY_GAME_ID}`;
    const contributionPath = `pitched_games/${MY_GAME_ID}/contributions/${MY_ID}-story`;
    describe("agg", () => {
      testMetricAggregations(path, "score");
      testMetricAggregations(path, "rating");
      testMetricAggregations(path, "rank");
      testWritableAggregations(path, "likes");
      testWritableAggregations(path, "dislikes");
      testWritableAggregations(path, "kudos");
      testCountOnlyAggregations(path, "contributions");
    });
    describe("contributions", () => {
      describe("agg", () => {
        testMetricAggregations(contributionPath, "score");
        testMetricAggregations(contributionPath, "rating");
        testMetricAggregations(contributionPath, "rank");
        testWritableAggregations(contributionPath, "likes");
        testWritableAggregations(contributionPath, "dislikes");
        testWritableAggregations(contributionPath, "kudos");
      });
    });
  });

  describe("studios", () => {
    const col = "studios";
    const id = MY_STUDIO_ID;
    const path = `${col}/${id}`;
    describe("agg", () => {
      testWritableAggregations(path, "follows");
    });
    describe("doc", () => {
      testDoc(col, id);
    });
    describe("members", () => {
      testMembers(col, id, "members");
    });
  });

  describe("resources", () => {
    const col = "resources";
    const id = MY_RESOURCE_ID;
    const path = `${col}/${id}`;
    describe("agg", () => {
      testWritableAggregations(path, "follows");
    });
    describe("doc", () => {
      testDoc(col, id);
    });
    describe("members", () => {
      testMembers(col, id, "members");
    });
    describe("instances", () => {
      testInstances(col, id, "files");
      testInstances(col, id, "folders");
    });
  });

  describe("games", () => {
    const col = "games";
    const id = MY_GAME_ID;
    const path = `${col}/${id}`;
    describe("agg", () => {
      testWritableAggregations(path, "follows");
    });
    describe("doc", () => {
      testDoc(col, id);
    });
    describe("members", () => {
      testMembers(col, id, "members");
    });
    describe("instances", () => {
      testInstances(col, id, "files");
      testInstances(col, id, "folders");
      testInstances(col, id, "configs");
      testInstances(col, id, "constructs");
      testInstances(col, id, "blocks");
    });
  });
});

import * as firebase from "@firebase/rules-unit-testing";
import {
  AggregationType,
  MY_ID,
  MY_VALID_AUTH,
  THEIR_ID,
} from "../../constants";
import { getAdmin, getAuthor, getClient } from "../../utils";
import { getClientServerIncrement, getClientServerTimestamp } from "../utils";

export const testMyAggregations = (type: AggregationType) => {
  const collection = "users";
  describe(type, () => {
    it("can list your own", async () => {
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertSucceeds(
        client.database().ref(`${collection}/${MY_ID}/agg/${type}/data`).get()
      );
    });
    it("can list your own ordered by t", async () => {
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${collection}/${MY_ID}/agg/${type}/data`)
          .orderByChild("t")
          .get()
      );
    });
    it("can list your own ordered by g", async () => {
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertSucceeds(
        client
          .database()
          .ref(`${collection}/${MY_ID}/agg/${type}/data`)
          .orderByChild("g")
          .get()
      );
    });
    if (type !== "my_likes" && type !== "my_dislikes") {
      it("can make your aggregation public", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertSucceeds(
          client
            .database()
            .ref(`${collection}/${MY_ID}/agg/${type}/public`)
            .set(true)
        );
      });
      it("can make your aggregation private", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertSucceeds(
          client
            .database()
            .ref(`${collection}/${MY_ID}/agg/${type}/public`)
            .set(false)
        );
      });
      it("can list another user's aggregation if they made it public", async () => {
        const admin = getAdmin();
        await admin
          .database()
          .ref()
          .child(`${collection}/${THEIR_ID}/agg/${type}/public`)
          .set(true);
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertSucceeds(
          client
            .database()
            .ref(`${collection}/${THEIR_ID}/agg/${type}/data`)
            .get()
        );
      });
      it("can list another user's aggregation ordered by t if they made it public", async () => {
        const admin = getAdmin();
        await admin
          .database()
          .ref()
          .child(`${collection}/${THEIR_ID}/agg/${type}/public`)
          .set(true);
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertSucceeds(
          client
            .database()
            .ref(`${collection}/${THEIR_ID}/agg/${type}/data`)
            .orderByChild("t")
            .get()
        );
      });
      it("can list another user's aggregation ordered by g if they made it public", async () => {
        const admin = getAdmin();
        await admin
          .database()
          .ref()
          .child(`${collection}/${THEIR_ID}/agg/${type}/public`)
          .set(true);
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertSucceeds(
          client
            .database()
            .ref(`${collection}/${THEIR_ID}/agg/${type}/data`)
            .orderByChild("g")
            .get()
        );
      });
      it("CANNOT set your aggregation's public value something other than a boolean", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client
            .database()
            .ref(`${collection}/${MY_ID}/agg/${type}/public`)
            .set(1)
        );
        await firebase.assertFails(
          client
            .database()
            .ref(`${collection}/${MY_ID}/agg/${type}/public`)
            .set("text")
        );
        await firebase.assertFails(
          client
            .database()
            .ref(`${collection}/${MY_ID}/agg/${type}/public`)
            .set({ foo: true })
        );
      });
      it("CANNOT list another user's aggregation if they did not make it public", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client
            .database()
            .ref(`${collection}/${THEIR_ID}/agg/${type}/data`)
            .orderByChild("t")
            .get()
        );
      });
    }
  });
};

export const testMetricAggregations = (
  docPath: string,
  type: "score" | "rating" | "rank"
) => {
  describe(type, () => {
    it("can read", async () => {
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertSucceeds(
        client.database().ref(`${docPath}/agg/${type}`).get()
      );
    });
    it("CANNOT set", async () => {
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertFails(
        client.database().ref(`${docPath}/agg/${type}`).set(0)
      );
    });
    it("CANNOT remove", async () => {
      const client = getClient(MY_VALID_AUTH);
      await firebase.assertFails(
        client.database().ref(`${docPath}/agg/${type}`).remove()
      );
    });
  });
};

export const testCountOnlyAggregations = (
  docPath: string,
  type: AggregationType
) => {
  describe(type, () => {
    describe("count", () => {
      it("can read", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertSucceeds(
          client.database().ref(`${docPath}/agg/${type}/count`).get()
        );
      });
      it("CANNOT set", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client.database().ref(`${docPath}/agg/${type}/count`).set(0)
        );
      });
      it("CANNOT remove", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client.database().ref(`${docPath}/agg/${type}/count`).remove()
        );
      });
    });
  });
};

export const testWritableAggregations = (
  docPath: string,
  type: AggregationType
) => {
  describe(type, () => {
    describe("count", () => {
      it("can read", async () => {
        const client = getClient();
        await firebase.assertSucceeds(
          client.database().ref(`${docPath}/agg/${type}/count`).get()
        );
      });
      it("CANNOT remove", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client.database().ref(`${docPath}/agg/${type}/count`).remove()
        );
      });
      it("CANNOT set without adding or removing uid", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client.database().ref(`${docPath}/agg/${type}/count`).set(0)
        );
      });
      it("CANNOT increment count multiple times", async () => {
        const admin = getAdmin();
        await admin
          .database()
          .ref(`${docPath}/agg/${type}`)
          .update({
            count: getClientServerIncrement(1),
            [`data/${MY_ID}`]: {
              t: getClientServerTimestamp(),
              a: getAuthor(MY_VALID_AUTH),
            },
          });

        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client
            .database()
            .ref(`${docPath}/agg/${type}`)
            .update({
              count: getClientServerIncrement(1),
              [`data/${MY_ID}`]: {
                t: getClientServerTimestamp(),
                a: getAuthor(MY_VALID_AUTH),
              },
            })
        );
      });
      it("CANNOT decrement count multiple times", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client
            .database()
            .ref(`${docPath}/agg/${type}`)
            .update({
              count: getClientServerIncrement(-1),
              [`data/${MY_ID}`]: null,
            })
        );
      });
    });
    describe("data", () => {
      it("can read your activity", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertSucceeds(
          client.database().ref(`${docPath}/agg/${type}/data/${MY_ID}`).get()
        );
      });
      if (type !== "likes" && type !== "dislikes") {
        it("can list", async () => {
          const client = getClient(MY_VALID_AUTH);
          await firebase.assertSucceeds(
            client.database().ref(`${docPath}/agg/${type}/data`).get()
          );
        });
        it("can list ordered by t", async () => {
          const client = getClient(MY_VALID_AUTH);
          await firebase.assertSucceeds(
            client
              .database()
              .ref(`${docPath}/agg/${type}/data`)
              .orderByChild("t")
              .get()
          );
        });
        it("can list ordered by a/u", async () => {
          const client = getClient(MY_VALID_AUTH);
          await firebase.assertSucceeds(
            client
              .database()
              .ref(`${docPath}/agg/${type}/data`)
              .orderByChild("a/u")
              .limitToFirst(100)
              .get()
          );
        });
      }
      it("can add uid if incremented counter by 1", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertSucceeds(
          client
            .database()
            .ref(`${docPath}/agg/${type}`)
            .update({
              count: getClientServerIncrement(1),
              [`data/${MY_ID}`]: {
                t: getClientServerTimestamp(),
                a: getAuthor(MY_VALID_AUTH),
              },
            })
        );
      });
      it("can remove uid if decremented counter by 1", async () => {
        const admin = getAdmin();
        await admin
          .database()
          .ref(`${docPath}/agg/${type}`)
          .update({
            count: getClientServerIncrement(1),
            [`data/${MY_ID}`]: {
              t: getClientServerTimestamp(),
              a: getAuthor(MY_VALID_AUTH),
            },
          });

        const client = getClient(MY_VALID_AUTH);
        await firebase.assertSucceeds(
          client
            .database()
            .ref(`${docPath}/agg/${type}`)
            .update({
              count: getClientServerIncrement(-1),
              [`data/${MY_ID}`]: null,
            })
        );
      });
      if (type === "kudos") {
        it("can write with content <= 300 characters", async () => {
          const client = getClient(MY_VALID_AUTH);
          await firebase.assertSucceeds(
            client
              .database()
              .ref(`${docPath}/agg/${type}`)
              .update({
                count: getClientServerIncrement(1),
                [`data/${MY_ID}`]: {
                  t: getClientServerTimestamp(),
                  a: getAuthor(MY_VALID_AUTH),
                  c: "This is some content",
                },
              })
          );
        });
      }
      if (type === "likes" || type === "dislikes") {
        it("CANNOT read another user's activity", async () => {
          const client = getClient(MY_VALID_AUTH);
          await firebase.assertFails(
            client
              .database()
              .ref(`${docPath}/agg/${type}/data/${THEIR_ID}`)
              .get()
          );
        });
      }
      it("CANNOT added uid without incrementing counter by 1", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client
            .database()
            .ref(`${docPath}/agg/${type}`)
            .update({
              [`data/${MY_ID}`]: {
                t: getClientServerTimestamp(),
                a: getAuthor(MY_VALID_AUTH),
              },
            })
        );
      });
      it("CANNOT remove uid without decrementing counter by 1", async () => {
        const admin = getAdmin();
        await admin
          .database()
          .ref(`${docPath}/agg/${type}`)
          .update({
            count: getClientServerIncrement(1),
            [`data/${MY_ID}`]: {
              t: getClientServerTimestamp(),
              a: getAuthor(MY_VALID_AUTH),
            },
          });

        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client
            .database()
            .ref(`${docPath}/agg/${type}`)
            .update({
              [`data/${MY_ID}`]: null,
            })
        );
      });
      it("CANNOT write scalar value", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client
            .database()
            .ref(`${docPath}/agg/${type}`)
            .update({
              count: getClientServerIncrement(1),
              [`data/${MY_ID}`]: true,
            })
        );
      });
      it("CANNOT write with unrecognized fields", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client
            .database()
            .ref(`${docPath}/agg/${type}`)
            .update({
              count: getClientServerIncrement(1),
              [`data/${MY_ID}`]: {
                t: getClientServerTimestamp(),
                a: getAuthor(MY_VALID_AUTH),
                foo: true,
              },
            })
        );
      });
      it("CANNOT write without time", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client
            .database()
            .ref(`${docPath}/agg/${type}`)
            .update({
              count: getClientServerIncrement(1),
              [`data/${MY_ID}`]: {
                a: getAuthor(MY_VALID_AUTH),
              },
            })
        );
      });
      it("CANNOT write without author", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client
            .database()
            .ref(`${docPath}/agg/${type}`)
            .update({
              count: getClientServerIncrement(1),
              [`data/${MY_ID}`]: {
                t: getClientServerTimestamp(),
              },
            })
        );
      });
      if (type === "kudos") {
        it("CANNOT write with content > 300 characters", async () => {
          const client = getClient(MY_VALID_AUTH);
          await firebase.assertFails(
            client
              .database()
              .ref(`${docPath}/agg/${type}`)
              .update({
                count: getClientServerIncrement(1),
                [`data/${MY_ID}`]: {
                  t: getClientServerTimestamp(),
                  a: getAuthor(MY_VALID_AUTH),
                  c: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Praesent facilisis quis ligula sit amet eleifend. Maecenas vel turpis ultrices, tristique arcu id, pulvinar odio. Nunc condimentum ac purus eu rutrum. Pellentesque commodo mollis metus efficitur elementum. Fusce ultrices sit amet ligula vel feugiat. Vestibulum tempor aliquam laoreet. Phasellus semper, tortor suscipit laoreet tempor, odio ex.",
                },
              })
          );
        });
      }
      it("CANNOT write with t that doesn't match server time", async () => {
        const client = getClient(MY_VALID_AUTH);
        await firebase.assertFails(
          client
            .database()
            .ref(`${docPath}/agg/${type}`)
            .update({
              count: getClientServerIncrement(1),
              [`data/${MY_ID}`]: {
                t: new Date().getTime(),
                a: getAuthor(MY_VALID_AUTH),
              },
            })
        );
      });
      it(`CANNOT add uid that matches parent id (cannot ${type.slice(
        0,
        -1
      )} self)`, async () => {
        const client = getClient(MY_VALID_AUTH);
        const docId = docPath.split("/")[1];
        await firebase.assertFails(
          client
            .database()
            .ref(`${docPath}/agg/${type}`)
            .update({
              count: getClientServerIncrement(1),
              [`data/${docId}`]: {
                t: getClientServerTimestamp(),
                a: getAuthor(MY_VALID_AUTH),
              },
            })
        );
      });
    });
  });
};

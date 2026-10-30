import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { INTERNAL_ERROR } from "@impower/jsonrpc/src/common/utils/toResponseError";
import {
  Connection,
  DISCONNECTED,
  METHOD_NOT_FOUND,
  SUPERSEDED,
} from "@impower/spark-engine/src/game/core/classes/Connection";
import { AnimateElementsMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/AnimateElementsMessage";
import { BatchElementsMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/BatchElementsMessage";
import { BeatMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/BeatMessage";
import { LoadAssetsMessage } from "@impower/spark-engine/src/game/modules/assets/classes/messages/LoadAssetsMessage";
import { LoadAudioPlayerMessage } from "@impower/spark-engine/src/game/modules/audio/classes/messages/LoadAudioPlayerMessage";
import { WriteTextMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteTextMessage";
import { cloneMessage } from "@impower/spark-engine/src/tests/harness/cloneMessage";
import { describe, expect, it } from "vitest";
import { Manager } from "./Manager";
import { MessageRouter } from "./MessageRouter";

class StalledManager extends Manager {
  received: string[] = [];

  constructor(protected _methods: string[]) {
    super({} as any);
  }

  override onReceiveRequest(msg: RequestMessage) {
    if (!this._methods.includes(msg.method)) {
      return Promise.resolve(undefined);
    }
    this.received.push(msg.method);
    return new Promise<never>(() => {});
  }
}

const connect = (managers: Manager[]) => {
  const connection = new Connection({});
  const router = new MessageRouter(
    () => managers,
    (message) => connection.receive(cloneMessage(message)),
  );
  connection.connectOutput((message) => router.receive(cloneMessage(message)));
  return { connection, router };
};

const settle = (promise: Promise<unknown>) =>
  promise.then(
    (result) => ({ resolved: result }),
    (error) => ({ rejected: error }),
  );

const sendBeat = (connection: Connection) => {
  const animate = (element: string) =>
    AnimateElementsMessage.type.request({
      effects: [{ element, animations: [] }],
    });
  const alone = animate("portrait");
  const batched = animate("backdrop");
  const waits = [alone, batched].map((msg) =>
    settle(connection.expect(msg)),
  );
  void connection.emit(
    BeatMessage.type.notification({
      messages: [
        alone,
        BatchElementsMessage.type.notification({ messages: [batched] }),
      ],
    }),
  );
  return waits;
};

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

describe("MessageRouter", () => {
  it("answers a request no manager handles with an error", async () => {
    const { connection } = connect([new StalledManager([])]);
    const outcome = await settle(
      connection.emit(
        WriteTextMessage.type.request({
          target: "dialogue",
          instructions: [],
          instant: true,
        }),
      ),
    );
    expect(outcome).toMatchObject({
      rejected: { code: METHOD_NOT_FOUND, data: "ui/write-text" },
    });
  });

  it("rejects every request still open when the page disconnects", async () => {
    const stalled = new StalledManager([
      "ui/write-text",
      "assets/load",
      "audio/load",
    ]);
    const { connection, router } = connect([stalled]);
    const outcomes = [
      connection.emit(
        WriteTextMessage.type.request({
          target: "dialogue",
          instructions: [{ text: "Hi" }],
          instant: false,
        }),
      ),
      connection.emit(
        LoadAssetsMessage.type.request({
          items: [{ kind: "image", src: "/hero.png" }],
          priority: 0,
          pin: "beat:1",
        }),
      ),
      connection.emit(
        LoadAudioPlayerMessage.type.request({
          channel: "music",
          key: "music.theme",
          src: "/theme.mp3",
          mixer: "music",
          mixerGain: 1,
        }),
      ),
    ].map(settle);
    await flush();
    expect(stalled.received).toEqual([
      "ui/write-text",
      "assets/load",
      "audio/load",
    ]);
    let settled = 0;
    outcomes.forEach((o) => o.then(() => (settled += 1)));
    await flush();
    expect(settled).toBe(0);

    router.disconnect();

    expect(await Promise.all(outcomes)).toMatchObject([
      { rejected: { code: DISCONNECTED, data: "ui/write-text" } },
      { rejected: { code: DISCONNECTED, data: "assets/load" } },
      { rejected: { code: DISCONNECTED, data: "audio/load" } },
    ]);
    expect(
      await settle(
        connection.emit(
          WriteTextMessage.type.request({
            target: "dialogue",
            instructions: [],
            instant: true,
          }),
        ),
      ),
    ).toMatchObject({ rejected: { code: DISCONNECTED } });
  });

  it("answers the animations of a beat that arrives after the page disconnected", async () => {
    const { connection, router } = connect([new StalledManager([])]);
    router.disconnect();
    expect(await Promise.all(sendBeat(connection))).toMatchObject([
      { rejected: { code: DISCONNECTED, data: "ui/animate" } },
      { rejected: { code: DISCONNECTED, data: "ui/animate" } },
    ]);
  });

  it("answers the animations of a beat from a superseded stream", async () => {
    const { connection, router } = connect([new StalledManager([])]);
    router.receive({
      ...BatchElementsMessage.type.notification({ messages: [] }),
      epoch: connection.epoch + 1,
    });
    expect(await Promise.all(sendBeat(connection))).toMatchObject([
      { rejected: { code: SUPERSEDED, data: "ui/animate" } },
      { rejected: { code: SUPERSEDED, data: "ui/animate" } },
    ]);
  });

  it("hands a beat from the current stream to the managers and leaves its animations for them to answer", async () => {
    const received: string[] = [];
    const answering = new (class extends Manager {
      override onReceiveNotification(msg: { method: string }) {
        received.push(msg.method);
      }
    })({} as any);
    const { connection } = connect([answering]);
    const waits = sendBeat(connection);
    await flush();
    expect(received).toEqual(["ui/beat"]);
    let settled = 0;
    waits.forEach((w) => w.then(() => (settled += 1)));
    await flush();
    expect(settled).toBe(0);
  });

  it("answers a handler that throws with its error, unless another manager handles the method", async () => {
    const throwsAtOnce = new (class extends Manager {
      override onReceiveRequest(): Promise<undefined> {
        throw new Error("broke before its first await");
      }
    })({} as any);
    const rejects = new (class extends Manager {
      override async onReceiveRequest(): Promise<undefined> {
        throw new Error("broke after its first await");
      }
    })({} as any);
    const write = () =>
      WriteTextMessage.type.request({
        target: "dialogue",
        instructions: [],
        instant: true,
      });
    for (const failing of [throwsAtOnce, rejects]) {
      const { connection } = connect([failing]);
      expect(await settle(connection.emit(write()))).toMatchObject({
        rejected: { code: INTERNAL_ERROR, message: /broke/ },
      });
    }
    const answering = new (class extends Manager {
      override async onReceiveRequest() {
        return WriteTextMessage.type.result("dialogue");
      }
    })({} as any);
    const { connection } = connect([throwsAtOnce, rejects, answering]);
    expect(await connection.emit(write())).toBe("dialogue");
  });

  it("answers with the manager that handles the method", async () => {
    const answering = new (class extends Manager {
      override async onReceiveRequest(msg: RequestMessage) {
        return msg.method === "ui/write-text"
          ? WriteTextMessage.type.result("dialogue")
          : undefined;
      }
    })({} as any);
    const { connection } = connect([new StalledManager([]), answering]);
    expect(
      await connection.emit(
        WriteTextMessage.type.request({
          target: "dialogue",
          instructions: [],
          instant: true,
        }),
      ),
    ).toBe("dialogue");
  });
});

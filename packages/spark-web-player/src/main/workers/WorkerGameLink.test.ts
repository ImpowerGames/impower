// While PLAY's game is attached, its stream comes on a channel of its own, and
// the page tells the player's worker when it has finished rendering a frame,
// which the worker's games tick on, so what a tick posts reaches a page that
// is not rendering (#811). The stopped preview never ticks, so its sink keeps
// the connection and sends nothing.
import { PageFramedMessage } from "@impower/spark-engine/src/game/core/classes/messages/PageFramedMessage";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WorkerGameLink } from "./WorkerGameLink";

afterEach(() => vi.unstubAllGlobals());

/** A link whose page frames and timers the test runs. */
const createLink = () => {
  const posted: any[] = [];
  let frames: (() => void)[] = [];
  let tasks: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("setTimeout", (handler: () => void) => {
    tasks.push(handler);
    return tasks.length;
  });
  const channels: { onmessage: ((e: MessageEvent) => void) | null }[] = [];
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage = null;
      constructor(readonly name: string) {
        channels.push(this);
      }
      close() {}
    },
  );
  let connectionListener: (e: MessageEvent) => void = () => {};
  const link = new WorkerGameLink({
    addEventListener: (_: string, listener: (e: MessageEvent) => void) => {
      connectionListener = listener;
    },
    postMessage: (message: any) => posted.push(message),
  } as any);
  /** A game message arriving on the connection, or on the last channel. */
  const fromConnection = (data: any) => connectionListener({ data } as MessageEvent);
  const fromChannel = (data: any) => channels.at(-1)!.onmessage!({ data } as MessageEvent);
  /** Render one frame: its callbacks, then the tasks they queued. */
  const frame = () => {
    const running = frames;
    frames = [];
    for (const callback of running) callback();
    const queued = tasks;
    tasks = [];
    for (const task of queued) task();
  };
  const framed = () =>
    posted.filter((m) => PageFramedMessage.type.isNotification(m)).length;
  return { link, frame, framed, fromConnection, fromChannel };
};

describe("the page's frames", () => {
  test("reach the worker once each has rendered, while PLAY's sink is attached", () => {
    const { link, frame, framed } = createLink();
    const sink = () => {};

    link.attachPlay(sink);
    frame();
    frame();
    frame();
    expect(framed()).toBe(3);

    link.detach(sink);
    frame();
    frame();
    expect(framed()).toBe(3);
  });

  test("are not sent for the stopped preview's sink", () => {
    const { link, frame, framed } = createLink();

    link.attach(() => {});
    frame();
    frame();

    expect(framed()).toBe(0);
  });
});

/** A game message of a stream's `epoch`. */
const streamed = (text: string, epoch: number) => ({
  jsonrpc: "2.0",
  method: "ui/update",
  params: { text },
  epoch,
});

describe("PLAY's sink", () => {
  // The connection and the channel keep no order between them, and each
  // game numbers its epochs from one, so a preview message arriving after
  // PLAY's could supersede PLAY's whole stream at the router.
  test("hears only PLAY's channel, whatever arrives on the connection meanwhile", () => {
    const { link, fromConnection, fromChannel } = createLink();
    const heard: string[] = [];
    const sink = (message: any) => heard.push(message.params.text);

    link.attachPlay(sink);
    fromChannel(streamed("play before", 1));
    fromConnection(streamed("late preview", 2));
    fromChannel(streamed("play after", 1));

    expect(heard).toEqual(["play before", "play after"]);
  });

  test("leaves the preview's sink hearing the connection", () => {
    const { link, fromConnection } = createLink();
    const heard: string[] = [];

    link.attach((message: any) => heard.push(message.params.text));
    fromConnection(streamed("preview", 1));

    expect(heard).toEqual(["preview"]);
  });
});

import { PageFramedMessage } from "@impower/spark-engine/src/game/core/classes/messages/PageFramedMessage";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WorkerGameLink } from "./WorkerGameLink";

afterEach(() => vi.unstubAllGlobals());

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
  const fromConnection = (data: any) => connectionListener({ data } as MessageEvent);
  const fromChannel = (data: any) => channels.at(-1)!.onmessage!({ data } as MessageEvent);
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

const streamed = (text: string, epoch: number) => ({
  jsonrpc: "2.0",
  method: "ui/update",
  params: { text },
  epoch,
});

describe("PLAY's sink", () => {
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

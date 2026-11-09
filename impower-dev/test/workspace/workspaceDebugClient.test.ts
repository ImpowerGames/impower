import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import type { DebugProtocol } from "@vscode/debugprotocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkspaceDebugClient, {
  type DebugAdapter,
} from "../../src/modules/spark-editor/workspace/WorkspaceDebugClient";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const MAIN = "file:///local/main.sd";

const fakeAdapter = (refuse: Record<string, string> = {}, holdStack = false) => {
  const requests: DebugProtocol.Request[] = [];
  let send: (message: DebugProtocol.ProtocolMessage) => void = () => {};
  let seq = 0;
  const frames: DebugProtocol.StackFrame[] = [];
  let releaseStack = () => {};
  const adapter: DebugAdapter = {
    handleMessage(message) {
      const request = message as DebugProtocol.Request;
      requests.push(request);
      const refusal = refuse[request.command];
      const answer = () => send({
        seq: ++seq,
        type: "response",
        request_seq: request.seq,
        command: request.command,
        success: refusal === undefined,
        ...(refusal !== undefined ? { message: refusal } : {}),
        ...(request.command === "stackTrace"
          ? { body: { stackFrames: frames, totalFrames: frames.length } }
          : {}),
      } as DebugProtocol.Response);
      if (holdStack && request.command === "stackTrace") {
        releaseStack = answer;
      } else {
        answer();
      }
    },
    onDidSendMessage(listener) {
      send = listener;
    },
    dispose: vi.fn(),
  };
  return {
    adapter,
    requests,
    commands: () => requests.map((r) => r.command),
    releaseStack: () => releaseStack(),
    event: (event: string, body: unknown) =>
      send({ seq: ++seq, type: "event", event, body } as DebugProtocol.Event),
    stackAt: (...lines: number[]) => {
      frames.splice(
        0,
        frames.length,
        ...lines.map((line, id) => ({
          id,
          name: id === 0 ? "sub" : "main",
          line,
          column: 0,
          source: { path: MAIN },
        })),
      );
    },
  };
};

const client = (fake: ReturnType<typeof fakeAdapter>) => {
  const onStop = vi.fn();
  const onRefusal = vi.fn();
  const debug = new WorkspaceDebugClient({
    onStop,
    onRefusal,
    createAdapter: async () => fake.adapter,
  });
  return { debug, onStop, onRefusal };
};

let ending: WorkspaceDebugClient | undefined;
afterEach(() => {
  ending?.end();
  ending = undefined;
});

describe("the web editor's debug client", () => {
  it("starts a session with initialize, launch and configurationDone when a run starts", async () => {
    const fake = fakeAdapter();
    const { debug } = client(fake);
    ending = debug;
    expect(await debug.start(MAIN)).toBe(true);
    expect(fake.commands()).toEqual(["initialize", "launch", "configurationDone"]);
    expect(fake.requests[0]!.arguments).toMatchObject({
      pathFormat: "path",
      linesStartAt1: false,
      columnsStartAt1: false,
    });
    expect(fake.requests[1]!.arguments).toEqual({ program: MAIN });
  });

  it("sends pause, then next, stepIn and stepOut for Step Over, Into and Out, and continue to resume", async () => {
    const fake = fakeAdapter();
    const { debug } = client(fake);
    ending = debug;
    await debug.start(MAIN);
    expect(await debug.pause()).toBe(true);
    expect(await debug.next()).toBe(true);
    expect(await debug.stepIn()).toBe(true);
    expect(await debug.stepOut()).toBe(true);
    expect(await debug.continue()).toBe(true);
    expect(fake.commands().slice(3)).toEqual([
      "pause",
      "next",
      "stepIn",
      "stepOut",
      "continue",
    ]);
  });

  it("keeps a stop and its stack trace in the store and moves the run to the stopped line", async () => {
    const fake = fakeAdapter();
    const { debug, onStop } = client(fake);
    ending = debug;
    await debug.start(MAIN);
    fake.stackAt(9, 4);
    fake.event("stopped", { reason: "step", threadId: 0 });
    await vi.waitFor(() => expect(onStop).toHaveBeenCalledWith({ uri: MAIN, line: 9 }));
    expect(workspace.debugSession.value.stopped).toEqual({ reason: "step", threadId: 0 });
    expect(workspace.debugSession.value.stackTrace?.totalFrames).toBe(2);
    expect(fake.requests.at(-1)).toMatchObject({
      command: "stackTrace",
      arguments: { threadId: 0 },
    });
    fake.event("continued", { threadId: 0, allThreadsContinued: true });
    expect(workspace.debugSession.value).toMatchObject({ stopped: null, stackTrace: null });
  });

  it("drops a stack trace that arrives after the run continued", async () => {
    const fake = fakeAdapter();
    const { debug, onStop } = client(fake);
    ending = debug;
    await debug.start(MAIN);
    fake.stackAt(9, 4);
    const handle = fake.adapter.handleMessage.bind(fake.adapter);
    fake.adapter.handleMessage = (message) => {
      if ((message as DebugProtocol.Request).command === "stackTrace") {
        fake.event("continued", { threadId: 0 });
      }
      handle(message);
    };
    fake.event("stopped", { reason: "step", threadId: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onStop).not.toHaveBeenCalled();
    expect(workspace.debugSession.value.stackTrace).toBeNull();
  });

  it("drops a pause's stack trace that arrives after an accepted Resume", async () => {
    const fake = fakeAdapter({}, true);
    const { debug, onStop } = client(fake);
    ending = debug;
    await debug.start(MAIN);
    fake.stackAt(3);
    fake.event("stopped", { reason: "pause", threadId: 0 });
    expect(await debug.continue()).toBe(true);
    expect(workspace.debugSession.value).toMatchObject({ stopped: null, stackTrace: null });
    fake.releaseStack();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onStop).not.toHaveBeenCalled();
    expect(workspace.debugSession.value.stackTrace).toBeNull();
  });

  it("keeps a stop that lands while Resume is in flight", async () => {
    const fake = fakeAdapter();
    const { debug, onStop } = client(fake);
    ending = debug;
    await debug.start(MAIN);
    fake.stackAt(9);
    const handle = fake.adapter.handleMessage.bind(fake.adapter);
    fake.adapter.handleMessage = (message) => {
      if ((message as DebugProtocol.Request).command === "continue") {
        fake.event("stopped", { reason: "breakpoint", threadId: 0 });
      }
      handle(message);
    };
    expect(await debug.continue()).toBe(true);
    await vi.waitFor(() => expect(onStop).toHaveBeenCalledWith({ uri: MAIN, line: 9 }));
    expect(workspace.debugSession.value.stopped?.reason).toBe("breakpoint");
  });

  it("reports a refused stack trace for the running session", async () => {
    const fake = fakeAdapter({ stackTrace: "no game loaded" });
    const { debug, onRefusal, onStop } = client(fake);
    ending = debug;
    await debug.start(MAIN);
    fake.event("stopped", { reason: "pause", threadId: 0 });
    await vi.waitFor(() => expect(onRefusal).toHaveBeenCalledWith("no game loaded"));
    expect(onStop).not.toHaveBeenCalled();
  });

  it("stays quiet about a refused stack trace once the session has ended", async () => {
    const fake = fakeAdapter({ stackTrace: "no game loaded" }, true);
    const { debug, onRefusal } = client(fake);
    await debug.start(MAIN);
    fake.event("stopped", { reason: "pause", threadId: 0 });
    debug.end();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onRefusal).not.toHaveBeenCalled();
  });

  it("reports a request the adapter refuses and leaves the run as it was", async () => {
    const fake = fakeAdapter({ next: "no game loaded" });
    const { debug, onRefusal } = client(fake);
    ending = debug;
    await debug.start(MAIN);
    expect(await debug.next()).toBe(false);
    expect(onRefusal).toHaveBeenCalledWith("no game loaded");
  });

  it("ends the session when the run stops, answering nothing more", async () => {
    const fake = fakeAdapter();
    const { debug, onStop } = client(fake);
    await debug.start(MAIN);
    fake.stackAt(2);
    debug.end();
    expect(fake.adapter.dispose).toHaveBeenCalled();
    fake.event("stopped", { reason: "pause", threadId: 0 });
    expect(await debug.pause()).toBe(false);
    expect(onStop).not.toHaveBeenCalled();
    expect(workspace.debugSession.value).toEqual({
      stopped: null,
      stackTrace: null,
      canStepOut: false,
    });
  });

  it("takes Step Out's state from the engine's history on each stop and beat", async () => {
    const fake = fakeAdapter();
    const { debug } = client(fake);
    ending = debug;
    await debug.start(MAIN);
    expect(workspace.debugSession.value.canStepOut).toBe(false);
    sendProtocolMessage({
      jsonrpc: "2.0",
      method: "game/stepped",
      params: { location: { uri: MAIN, range: {} }, history: { canStepOut: true } },
    } as never);
    expect(workspace.debugSession.value.canStepOut).toBe(true);
    sendProtocolMessage({
      jsonrpc: "2.0",
      method: "game/executed",
      params: { conditions: [], choices: [], state: "running", history: { canStepOut: false } },
    } as never);
    expect(workspace.debugSession.value.canStepOut).toBe(false);
  });
});

describe("the web editor's debug client on the shared adapter", () => {
  const player = (refuse: Record<string, string> = {}) => {
    const target = new EventTarget();
    const methods: string[] = [];
    const steps: unknown[] = [];
    target.addEventListener("jsonrpc", (e) => {
      const message = (e as CustomEvent).detail;
      if (!("id" in message) || !("params" in message)) {
        return;
      }
      methods.push(message.method);
      if (message.method === "game/step") {
        steps.push(message.params.traversal);
      }
      const answer = (payload: Record<string, unknown>) =>
        queueMicrotask(() =>
          sendProtocolMessage(
            { jsonrpc: "2.0", method: message.method, id: message.id, ...payload } as never,
            target,
          ),
        );
      if (refuse[message.method]) {
        answer({ error: { code: 1, message: refuse[message.method] } });
        return;
      }
      const results: Record<string, unknown> = {
        "preview/gameState": { launchState: "play", paused: false, run: 1 },
        "game/threads": { threads: [{ id: 0, name: "main" }], run: 1 },
        "game/stackTrace": {
          stackFrames: [
            {
              id: 0,
              name: "main",
              location: {
                uri: MAIN,
                range: { start: { line: 3, character: 2 }, end: { line: 3, character: 12 } },
              },
            },
          ],
          totalFrames: 1,
        },
        "game/pause": { run: 1 },
      };
      answer({ result: results[message.method] ?? {} });
    });
    return { target, methods, steps };
  };

  it("pauses and steps the player through the page's protocol, and stops on the player's line", async () => {
    const { target, methods, steps } = player();
    const onStop = vi.fn();
    const debug = new WorkspaceDebugClient({ onStop, target });
    ending = debug;
    expect(await debug.start(MAIN)).toBe(true);
    expect(await debug.pause()).toBe(true);
    await vi.waitFor(() => expect(onStop).toHaveBeenCalledWith({ uri: MAIN, line: 3 }));
    expect(workspace.debugSession.value.stopped?.reason).toBe("pause");
    expect(await debug.next()).toBe(true);
    expect(await debug.stepIn()).toBe(true);
    expect(await debug.stepOut()).toBe(true);
    expect(steps).toEqual(["over", "in", "out"]);
    expect(methods).toContain("game/pause");
  });

  it("shows the player's message when it refuses a step", async () => {
    const { target } = player({ "game/step": "no game loaded" });
    const onRefusal = vi.fn();
    const debug = new WorkspaceDebugClient({ onRefusal, target });
    ending = debug;
    await debug.start(MAIN);
    expect(await debug.stepIn()).toBe(false);
    expect(onRefusal).toHaveBeenCalledWith("no game loaded");
  });
});

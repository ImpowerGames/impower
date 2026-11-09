import type { DebugProtocol } from "@vscode/debugprotocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceDebugClient, {
  type DebugAdapter,
} from "../../src/modules/spark-editor/workspace/WorkspaceDebugClient";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const MAIN = "file:///local/main.sd";
const OTHER = "file:///local/other.sd";

const fakeAdapter = (
  answer: (request: DebugProtocol.Request) => Partial<DebugProtocol.Response> = () => ({}),
) => {
  const requests: DebugProtocol.Request[] = [];
  let send: (message: DebugProtocol.ProtocolMessage) => void = () => {};
  let seq = 0;
  const adapter: DebugAdapter = {
    handleMessage(message) {
      const request = message as DebugProtocol.Request;
      requests.push(request);
      send({
        seq: ++seq,
        type: "response",
        request_seq: request.seq,
        command: request.command,
        success: true,
        ...answer(request),
      } as DebugProtocol.Response);
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
    event: (event: string, body: unknown) =>
      send({ seq: ++seq, type: "event", event, body } as DebugProtocol.Event),
  };
};

const verifying = (moves: Record<number, number | null>) => (request: DebugProtocol.Request) => {
  if (request.command === "setBreakpoints") {
    const args = request.arguments as DebugProtocol.SetBreakpointsArguments;
    return {
      body: {
        breakpoints: (args.breakpoints ?? []).map((b) => {
          const moved = moves[b.line];
          return moved === null
            ? { verified: false, message: "No instruction found at the breakpoint" }
            : { verified: true, line: moved ?? b.line, source: args.source };
        }),
      },
    };
  }
  if (request.command === "stackTrace") {
    return {
      body: {
        stackFrames: [{ id: 4, name: "start", line: 3, column: 0, source: { path: MAIN } }],
        totalFrames: 1,
      },
    };
  }
  if (request.command === "evaluate") {
    const args = request.arguments as DebugProtocol.EvaluateArguments;
    return args.expression === "mood"
      ? { body: { result: "2", variablesReference: 0 } }
      : { success: false, message: "not available in this frame" };
  }
  return {};
};

let ending: WorkspaceDebugClient | undefined;
const client = (fake: ReturnType<typeof fakeAdapter>) => {
  ending = new WorkspaceDebugClient({ createAdapter: async () => fake.adapter });
  return ending;
};

const withBreakpoints = (breakpoints: Record<string, number[]>) => {
  workspace.current = {
    ...workspace.current,
    debug: { ...workspace.current.debug, breakpoints },
  };
};

beforeEach(() => withBreakpoints({}));
afterEach(() => {
  ending?.end();
  ending = undefined;
});

describe("breakpoints through the web editor's debug client", () => {
  it("sends each script's breakpoints before configurationDone when a run starts", async () => {
    withBreakpoints({ [MAIN]: [4, 9], [OTHER]: [], "file:///local/third.sd": [1] });
    const fake = fakeAdapter(verifying({}));
    expect(await client(fake).start(MAIN)).toBe(true);
    expect(fake.commands()).toEqual([
      "initialize",
      "launch",
      "setBreakpoints",
      "setBreakpoints",
      "setBreakpoints",
      "configurationDone",
    ]);
    expect(fake.requests.slice(2, 5).map((r) => r.arguments)).toEqual([
      { source: { path: MAIN }, breakpoints: [{ line: 4 }, { line: 9 }] },
      { source: { path: OTHER }, breakpoints: [] },
      { source: { path: "file:///local/third.sd" }, breakpoints: [{ line: 1 }] },
    ]);
  });

  it("clears every breakpoint an earlier run left behind when a run starts with none saved", async () => {
    const fake = fakeAdapter(verifying({}));
    expect(await client(fake).start(MAIN)).toBe(true);
    expect(fake.commands()).toEqual([
      "initialize",
      "launch",
      "setBreakpoints",
      "configurationDone",
    ]);
    expect(fake.requests[2]!.arguments).toEqual({
      source: { path: MAIN },
      breakpoints: [],
    });
  });

  it("keeps the line the adapter verified, and marks one it could not place, in the debug slice", async () => {
    withBreakpoints({ [MAIN]: [3, 7] });
    const fake = fakeAdapter(verifying({ 3: 5, 7: null }));
    await client(fake).start(MAIN);
    expect(workspace.debugSession.value.breakpoints).toEqual({
      [MAIN]: [
        { line: 5, verified: true },
        { line: 7, verified: false },
      ],
    });
  });

  it("sends a script's breakpoints again when they change during a run", async () => {
    const fake = fakeAdapter(verifying({ 2: 4 }));
    const debug = client(fake);
    await debug.start(MAIN);
    expect(await debug.setBreakpoints(OTHER, [2])).toBe(true);
    expect(fake.requests.at(-1)).toMatchObject({
      command: "setBreakpoints",
      arguments: { source: { path: OTHER }, breakpoints: [{ line: 2 }] },
    });
    expect(workspace.debugSession.value.breakpoints[OTHER]).toEqual([
      { line: 4, verified: true },
    ]);
  });

  it("sends nothing when no run is in progress", async () => {
    const debug = new WorkspaceDebugClient();
    expect(await debug.setBreakpoints(MAIN, [2])).toBe(false);
    expect(await debug.evaluate("mood")).toBeNull();
  });

  it("evaluates a hovered name in the top frame only while stopped", async () => {
    const fake = fakeAdapter(verifying({}));
    const debug = client(fake);
    await debug.start(MAIN);
    expect(await debug.evaluate("mood")).toBeNull();
    expect(fake.commands()).not.toContain("evaluate");
    fake.event("stopped", { reason: "breakpoint", threadId: 0 });
    await vi.waitFor(() =>
      expect(workspace.debugSession.value.stackTrace?.totalFrames).toBe(1),
    );
    expect(await debug.evaluate("mood")).toBe("2");
    expect(fake.requests.at(-1)).toMatchObject({
      command: "evaluate",
      arguments: { expression: "mood", context: "hover", frameId: 4 },
    });
    expect(await debug.evaluate("nothing")).toBeNull();
  });
});

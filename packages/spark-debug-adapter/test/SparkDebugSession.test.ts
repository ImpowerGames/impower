import type { Connection } from "@impower/spark-engine/src/game/core/classes/Connection";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { compileProgram } from "@impower/spark-engine/src/tests/harness/compileProgram";
import type { DebugProtocol } from "@vscode/debugprotocol";
import { describe, expect, it } from "vitest";
import {
  SparkDebugSession,
  type FileAccessor,
  type SparkDebugSessionHost,
} from "../src/index";

const MAIN_URI = "file:///project/main.sd";
const GAME_URI = "inmemory:///main.sd";
const MAIN_PATH = "/project/main.sd";

const range = (line: number, start: number, end: number) => ({
  start: { line, character: start },
  end: { line, character: end },
});

const fileAccessor: FileAccessor = {
  isWindows: false,
  readFile: async () => new Uint8Array(),
  writeFile: async () => {},
  showFile: async () => {},
  getSelectedLine: async () => undefined,
  revealLine: async () => {},
  isActiveTextEditor: () => false,
  pathToUri: (path) => `file://${path}`,
  uriToPath: (uri) => uri.replace("file://", ""),
  getRootPath: () => "/project",
};

const createSession = (
  host: SparkDebugSessionHost,
  answerBreakpoints?: (breakpoints: { file: string; line: number }[]) => unknown[],
) => {
  const emitted: { method: string; params: any }[] = [];
  let receive: ((msg: any) => Promise<unknown>) | undefined;
  const connection = {
    connectInput(onReceive: (msg: any) => Promise<unknown>) {
      receive = onReceive;
    },
    async emit(message: { method: string; params: any }) {
      emitted.push(message);
      switch (message.method) {
        case "game/setBreakpoints":
          return {
            breakpoints: answerBreakpoints
              ? answerBreakpoints(message.params.breakpoints)
              : message.params.breakpoints.map(
                  (b: { file: string; line: number }) => ({
                    verified: true,
                    location: { uri: b.file, range: range(b.line, 2, 8) },
                  }),
                ),
          };
        case "game/threads":
          return { threads: [{ id: 1, name: "main" }] };
        case "game/stackTrace":
          return {
            stackFrames: [
              { id: 7, name: "start", location: { uri: MAIN_URI, range: range(2, 2, 9) } },
            ],
            totalFrames: 1,
          };
        default:
          return {};
      }
    },
  };
  const session = new SparkDebugSession(
    fileAccessor,
    connection as unknown as Connection,
    host,
  );
  const sent: DebugProtocol.ProtocolMessage[] = [];
  const waiters: (() => void)[] = [];
  session.onDidSendMessage((message) => {
    sent.push(message as DebugProtocol.ProtocolMessage);
    waiters.splice(0).forEach((wake) => wake());
  });
  let seq = 0;
  const request = async <T extends DebugProtocol.Response>(
    command: string,
    args?: unknown,
  ): Promise<T> => {
    seq += 1;
    const requestSeq = seq;
    session.handleMessage({ seq: requestSeq, type: "request", command, arguments: args } as DebugProtocol.Request);
    const find = () =>
      sent.find(
        (m) => m.type === "response" && (m as DebugProtocol.Response).request_seq === requestSeq,
      ) as T | undefined;
    for (;;) {
      const found = find();
      if (found) {
        return found;
      }
      await new Promise<void>((wake) => waiters.push(wake));
    }
  };
  const notify = async (method: string, params: unknown) => {
    void receive!({ jsonrpc: "2.0", method, params });
    await new Promise((settle) => setTimeout(settle, 0));
  };
  return { session, request, notify, sent, emitted };
};

describe("SparkDebugSession in a browser page", () => {
  it("runs in the jsdom environment", () => {
    expect(typeof window).toBe("object");
    expect(typeof document.createElement).toBe("function");
  });

  it("answers initialize, setBreakpoints, threads and stackTrace over a fake connection", async () => {
    const { request, sent, emitted } = createSession({ syncCursorToExecution: true });

    const initialize = await request<DebugProtocol.InitializeResponse>("initialize", {
      adapterID: "sparkdown",
      pathFormat: "path",
      linesStartAt1: true,
      columnsStartAt1: true,
    });
    expect(initialize).toMatchObject({ success: true });
    expect(initialize.body?.supportsConfigurationDoneRequest).toBe(true);
    expect(initialize.body?.supportsFunctionBreakpoints).toBe(true);
    expect(sent.some((m) => m.type === "event" && (m as DebugProtocol.Event).event === "initialized")).toBe(true);

    const setBreakpoints = await request<DebugProtocol.SetBreakpointsResponse>("setBreakpoints", {
      source: { path: MAIN_PATH },
      breakpoints: [{ line: 3 }],
    });
    expect(emitted.find((m) => m.method === "game/setBreakpoints")?.params).toEqual({
      breakpoints: [{ file: MAIN_URI, line: 2 }],
    });
    expect(setBreakpoints.success).toBe(true);
    expect(setBreakpoints.body.breakpoints).toHaveLength(1);
    expect(setBreakpoints.body.breakpoints[0]).toMatchObject({
      verified: true,
      line: 3,
      column: 3,
      source: { name: "main.sd", path: MAIN_PATH },
    });

    const threads = await request<DebugProtocol.ThreadsResponse>("threads");
    expect(threads.success).toBe(true);
    expect(threads.body.threads).toEqual([{ id: 1, name: "main" }]);

    const stackTrace = await request<DebugProtocol.StackTraceResponse>("stackTrace", { threadId: 1 });
    expect(stackTrace.success).toBe(true);
    expect(stackTrace.body.totalFrames).toBe(1);
    expect(stackTrace.body.stackFrames[0]).toMatchObject({
      id: 1,
      name: "start",
      line: 3,
      column: 3,
      endLine: 3,
      endColumn: 10,
      source: { name: "main.sd", path: MAIN_PATH },
    });
    expect(emitted.find((m) => m.method === "game/stackTrace")?.params).toMatchObject({ threadId: 1 });
  });

  it("keeps each script's breakpoints when another script's are set, and answers for the script asked", async () => {
    const { request, emitted } = createSession({ syncCursorToExecution: false });
    await request("initialize", {
      adapterID: "sparkdown",
      pathFormat: "path",
      linesStartAt1: true,
      columnsStartAt1: true,
    });
    const OTHER_PATH = "/project/other.sd";
    await request("setBreakpoints", {
      source: { path: MAIN_PATH },
      breakpoints: [{ line: 3 }, { line: 8 }],
    });
    const other = await request<DebugProtocol.SetBreakpointsResponse>("setBreakpoints", {
      source: { path: OTHER_PATH },
      breakpoints: [{ line: 5 }],
    });
    const sets = emitted.filter((m) => m.method === "game/setBreakpoints");
    expect(sets.at(-1)?.params).toEqual({
      breakpoints: [
        { file: MAIN_URI, line: 2 },
        { file: MAIN_URI, line: 7 },
        { file: "file:///project/other.sd", line: 4 },
      ],
    });
    expect(other.body.breakpoints).toHaveLength(1);
    expect(other.body.breakpoints[0]).toMatchObject({
      verified: true,
      line: 5,
      source: { path: OTHER_PATH },
    });
    await request("setBreakpoints", { source: { path: MAIN_PATH }, breakpoints: [] });
    expect(emitted.filter((m) => m.method === "game/setBreakpoints").at(-1)?.params).toEqual({
      breakpoints: [{ file: "file:///project/other.sd", line: 4 }],
    });
  });

  it.each([
    ["a declaration line", 1, "A declaration runs before the story starts"],
    ["a line with no statement", 7, "No statement to stop at here."],
  ])("answers a breakpoint the engine refuses on %s with the engine's reason", async (_, line, reason) => {
    const game = new Game({
      program: compileProgram(
        "define companion as character with\n  store trust = 0\nend\n\nscene start\n  Hello there.\nend\n",
      ),
    } as never);
    const { request } = createSession({ syncCursorToExecution: false }, (breakpoints) =>
      game.setBreakpoints(breakpoints.map((b) => ({ ...b, file: GAME_URI }))),
    );
    await request("initialize", {
      adapterID: "sparkdown",
      pathFormat: "path",
      linesStartAt1: true,
      columnsStartAt1: true,
    });
    const answer = await request<DebugProtocol.SetBreakpointsResponse>("setBreakpoints", {
      source: { path: MAIN_PATH },
      breakpoints: [{ line }, { line: 6 }],
    });
    expect(answer.body.breakpoints[0]).toMatchObject({ verified: false, message: reason });
    expect(answer.body.breakpoints[1]).toMatchObject({ verified: true, line: 6 });
    expect(answer.body.breakpoints[1]!.message).toBeUndefined();
  });

  it("reads syncCursorToExecution from the host each time the game awaits interaction", async () => {
    const host = { syncCursorToExecution: false };
    const { notify, emitted } = createSession(host);
    const threadQueries = () => emitted.filter((m) => m.method === "game/threads").length;
    const awaiting = { location: { uri: MAIN_URI, range: range(2, 2, 9) } };

    await notify("game/awaitingInteraction", awaiting);
    expect(threadQueries()).toBe(0);

    host.syncCursorToExecution = true;
    await notify("game/awaitingInteraction", awaiting);
    expect(threadQueries()).toBe(1);
  });
});

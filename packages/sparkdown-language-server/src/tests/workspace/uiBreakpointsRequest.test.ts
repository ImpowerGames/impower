import { describe, expect, test, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { getUiBreakpoints } from "../../utils/providers/getUiBreakpoints";
import { quietly, silentConnection, TestWorkspace } from "./languageServerWorker";

const MAIN = "file:///project/main.sd";
const CONFIG = "file:///project/config.sd";

const override = (sm: number) =>
  `define ui as config with\n  breakpoints = { sm = ${sm} }\nend\n`;

const SCENE = "\nscene start\n  A line.\nend\n";

async function setup(texts: Record<string, string>) {
  vi.stubGlobal("self", globalThis);
  const ws = new TestWorkspace(silentConnection);
  vi.spyOn(ws, "sendNotification").mockImplementation(() => undefined as never);
  const files = Object.entries(texts).map(([uri, text]) => ({
    uri,
    text,
    type: "script",
    name: uri.split("/").at(-1)!.slice(0, -3),
    ext: "sd",
    languageId: "sparkdown",
    version: 1,
  }));
  Object.assign(ws as any, { _scriptFilePattern: /\.sd$/, _projectLoaded: true });
  for (const file of files) {
    (ws as any)._watchedFiles.set(file.uri, file);
    (ws as any)._documentVersions.set(file.uri, 1);
  }
  ws.loadDocuments({ files });
  await quietly(() =>
    ws.loadCompiler({
      files,
      workspace: "file:///project",
      useBuiltinsPrelude: true,
    } as never),
  );
  return ws;
}

const holdFirstCompile = (ws: TestWorkspace) => {
  const compileDocument = (ws as any).compileDocument.bind(ws);
  let release!: () => void;
  let reached!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const started = new Promise<void>((resolve) => (reached = resolve));
  let first = true;
  (ws as any).compileDocument = async (uri: string) => {
    const result = await compileDocument(uri);
    if (first) {
      first = false;
      reached();
      await held;
    }
    return result;
  };
  return { started, release };
};

const requestBreakpoints = async (ws: TestWorkspace, uri: string) =>
  getUiBreakpoints(await quietly(() => ws.compile(uri, false)));

describe("the screen preview's breakpoint request answers with the current program", () => {
  test("each edit's override reaches the next request", async () => {
    const ws = await setup({ [MAIN]: override(500) + SCENE });
    expect((await requestBreakpoints(ws, MAIN))?.["sm"]).toBe(500);
    for (const [version, sm] of [
      [2, 510],
      [3, 520],
    ] as const) {
      await ws.changeTextDocument({
        textDocument: { uri: MAIN, version },
        contentChanges: [{ text: override(sm) + SCENE }],
      });
      expect((await requestBreakpoints(ws, MAIN))?.["sm"]).toBe(sm);
    }
  }, 20000);

  test("a request made while an older version compiles waits for the edit", async () => {
    const ws = await setup({ [MAIN]: override(500) + SCENE });
    const { started, release } = holdFirstCompile(ws);
    const older = quietly(() => ws.compile(MAIN, false));
    await started;
    await ws.changeTextDocument({
      textDocument: { uri: MAIN, version: 2 },
      contentChanges: [{ text: override(510) + SCENE }],
    });
    const requested = requestBreakpoints(ws, MAIN);
    release();
    await older;
    expect((await requested)?.["sm"]).toBe(510);
  }, 20000);

  test("an edit to an included file during an older compile reaches the request", async () => {
    const ws = await setup({
      [MAIN]: 'include "config"\n' + SCENE,
      [CONFIG]: override(500),
    });
    const { started, release } = holdFirstCompile(ws);
    const older = quietly(() => ws.compile(MAIN, false));
    await started;
    await ws.changeTextDocument({
      textDocument: { uri: CONFIG, version: 2 },
      contentChanges: [{ text: override(510) }],
    });
    const requested = requestBreakpoints(ws, MAIN);
    release();
    await older;
    expect((await requested)?.["sm"]).toBe(510);
  }, 20000);
});

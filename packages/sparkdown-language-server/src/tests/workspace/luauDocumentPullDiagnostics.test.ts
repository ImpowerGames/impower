import { describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { quietly, TestWorkspace } from "./languageServerWorker";

const MAIN = "file:///project/main.sd";
const UTIL = "file:///project/scripts/util.luau";
const BROKEN = "local = 3\n";

const capturingConnection = () => {
  const requests = new Map<string, (params: any) => any>();
  const connection = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === "onRequest"
          ? (method: string, handler: (params: any) => any) => {
              requests.set(method, handler);
              return { dispose() {} };
            }
          : () => ({ dispose() {} }),
    },
  ) as never;
  return { connection, requests };
};

describe("pulling an open .luau document's diagnostics", () => {
  it("reports the document version its published diagnostics belong to", async () => {
    vi.stubGlobal("self", globalThis);
    const { connection, requests } = capturingConnection();
    const workspace = new TestWorkspace(connection);
    vi.spyOn(workspace, "sendNotification").mockImplementation(() => undefined as never);
    workspace.listen();
    await quietly(() =>
      workspace.loadCompiler({
        files: [
          { uri: MAIN, type: "script", name: "main", ext: "sd", text: "Hello.\n", version: 1, languageId: "sparkdown" },
          { uri: UTIL, type: "script", name: "util", ext: "luau", text: BROKEN, version: 1, languageId: "luau" },
        ],
        workspace: "file:///project",
      } as never),
    );
    const pull = () =>
      requests.get("textDocument/diagnostic")!({ textDocument: { uri: UTIL } }) as Promise<{
        kind: string;
        resultId?: string;
        items: { message: string }[];
      }>;

    await quietly(() =>
      workspace.openTextDocument({ textDocument: { uri: UTIL, languageId: "luau", version: 1, text: BROKEN } }),
    );
    await vi.waitFor(async () => expect((await pull()).items.length).toBeGreaterThan(0), { timeout: 10000 });
    const opened = await pull();
    expect(opened.kind).toBe("full");
    expect(opened.resultId).toBe("1");
    expect(opened.items.map((d) => d.message).join("\n")).toContain("got '='");

    await quietly(() =>
      workspace.changeTextDocument({
        textDocument: { uri: UTIL, version: 2 },
        contentChanges: [{ range: { start: { line: 0, character: 6 }, end: { line: 0, character: 6 } }, text: "a " }],
      }),
    );
    await vi.waitFor(async () => expect((await pull()).resultId).toBe("2"), { timeout: 10000 });
    expect((await pull()).items).toEqual([]);

    await workspace.closeTextDocument({ textDocument: { uri: UTIL } });
    const closed = await pull();
    expect(closed.resultId).toBeUndefined();
    expect(closed.items).toEqual([]);
  }, 60_000);
});

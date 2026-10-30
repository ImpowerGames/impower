import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../main/workers/workspace.worker", () => ({ default: "" }));

const { installWorkspaceWorker } = await import(
  "../../main/workers/installWorkspaceWorker"
);

const MAIN = "file:///local/main.sd";
const LOOSE = "file:///local/loose.sd";

class StandInWorker {
  onerror: unknown;
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
  terminate() {}
}

const g = globalThis as any;
const originals = { Worker: g.Worker, createObjectURL: URL.createObjectURL };

beforeEach(() => {
  g.Worker = StandInWorker;
  URL.createObjectURL = () => "blob:worker";
});

afterEach(() => {
  g.Worker = originals.Worker;
  URL.createObjectURL = originals.createObjectURL;
});

const createWorkspace = () => {
  const host = {
    addEventListener() {},
    removeEventListener() {},
    sendResponse() {},
    request: () => new Promise(() => {}),
    sendRequest: () => new Promise(() => {}),
  };
  return installWorkspaceWorker(host as any).workspace;
};

const select = (uri: string, line: number, userEvent: boolean) => ({
  textDocument: { uri },
  selectedRange: {
    start: { line, character: 0 },
    end: { line, character: 0 },
  },
  docChanged: false,
  userEvent,
});

describe("the point the player's workspace compiles toward (#1874)", () => {
  it("moves with the author's selections only, as the page's preview point does", () => {
    const workspace = createWorkspace();
    void workspace.selectTextDocument(select(MAIN, 5, true));
    expect((workspace as any).compileStartFrom()).toEqual({ file: MAIN, line: 5 });

    void workspace.selectTextDocument(select(LOOSE, 2, false));
    expect((workspace as any).compileStartFrom()).toEqual({ file: MAIN, line: 5 });

    void workspace.selectTextDocument(select(LOOSE, 2, true));
    expect((workspace as any).compileStartFrom()).toEqual({ file: LOOSE, line: 2 });
  });

  it("is published with the story's program when a compile of another script changed the story", () => {
    const workspace = createWorkspace();
    expect((workspace as any).publishesStoryOfStandaloneCompiles).toBe(true);
  });

  it("moves with an edit that says where it left the author's selection (#1881)", () => {
    const workspace = createWorkspace();
    void workspace.selectTextDocument(select(MAIN, 5, true));
    const edit = (version: number, line: number, userEvent: boolean) =>
      void workspace.changeTextDocument({
        textDocument: { uri: MAIN, version },
        contentChanges: [{ text: "" }],
        selection: {
          selectedRange: {
            start: { line, character: 0 },
            end: { line, character: 0 },
          },
          userEvent,
        },
      });
    edit(2, 6, true);
    expect((workspace as any).compileStartFrom()).toEqual({ file: MAIN, line: 6 });
    edit(3, 9, false);
    expect((workspace as any).compileStartFrom()).toEqual({ file: MAIN, line: 6 });
  });

  it("is published for the author's selection when a later one the author did not make is answered first (#1881)", async () => {
    const workspace: any = createWorkspace();
    const published: any[] = [];
    workspace.sendNotification = async (_method: string, params: any) => {
      published.push(params);
    };
    workspace.compilerReady = async () => {};
    const held: (() => void)[] = [];
    workspace._compilerChannelConnection = {
      sendRequest: (_type: unknown, params: any) =>
        new Promise((resolve) => held.push(() => resolve({ ...params }))),
    };
    workspace._setAside.add({ file: MAIN, line: 9 });
    const author = workspace.selectTextDocument(select(MAIN, 5, true));
    await workspace.selectTextDocument(select(MAIN, 9, false));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(held).toHaveLength(1);
    for (const answer of held.splice(0)) answer();
    await author;
    expect(
      published
        .filter((p) => p.userEvent)
        .map((p) => p.selectedRange.start.line),
    ).toEqual([5]);
  });
});

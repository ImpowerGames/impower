// The player's page and its worker each judge a compiled program by a point:
// the page by its preview point, which only the author's selections move
// (`GamePlayerController.handleSelectedCompilerDocument`), the worker by the
// point the program was compiled to route to, which the workspace supplies.
// When a selection the author did not make (a jump from the Problems panel,
// say) moved the workspace's point into a script the story does not include,
// the two disagreed: the worker kept, as programs the page could name, a
// stream of that script's programs the page never took, and dropped story
// programs the page did take (#1874). The workspace's point now moves only
// with the author's selections, as the page's does.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../main/workers/workspace.worker", () => ({ default: "" }));

const { installWorkspaceWorker } = await import(
  "../../main/workers/installWorkspaceWorker"
);

const MAIN = "file:///local/main.sd";
const LOOSE = "file:///local/loose.sd";

/** A worker that keeps the port it is handed and answers nothing. */
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
    // The stand-in worker never answers, so a selection waits for it after
    // it has recorded its point; only that recording is under test.
    void workspace.selectTextDocument(select(MAIN, 5, true));
    expect((workspace as any).compileStartFrom()).toEqual({ file: MAIN, line: 5 });

    void workspace.selectTextDocument(select(LOOSE, 2, false));
    expect((workspace as any).compileStartFrom()).toEqual({ file: MAIN, line: 5 });

    void workspace.selectTextDocument(select(LOOSE, 2, true));
    expect((workspace as any).compileStartFrom()).toEqual({ file: LOOSE, line: 2 });
  });

  it("is published with the story's program when a compile of another script changed the story", () => {
    // A compile of a script the story does not include compiles the story
    // first; the page shows the story, so it must hear of the new program
    // (SparkdownWorkspace's workspaceStandaloneCompile test pins the publish).
    const workspace = createWorkspace();
    expect((workspace as any).publishesStoryOfStandaloneCompiles).toBe(true);
  });

  it("moves with an edit that says where it left the author's selection (#1881)", () => {
    const workspace = createWorkspace();
    void workspace.selectTextDocument(select(MAIN, 5, true));
    // The edit's compile can be sent before the selection the editor sent
    // after the edit is handled; it routes to where the edit left the author.
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
    // A selection the author did not make moves it no more than it would
    // when it came on its own.
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
    // The compiler answers the author's selection late.
    const held: (() => void)[] = [];
    workspace._compilerChannelConnection = {
      sendRequest: (_type: unknown, params: any) =>
        new Promise((resolve) => held.push(() => resolve({ ...params }))),
    };
    // A point set aside after the worker stopped answering there, which the
    // workspace answers itself.
    workspace._setAside.add({ file: MAIN, line: 9 });
    const author = workspace.selectTextDocument(select(MAIN, 5, true));
    await workspace.selectTextDocument(select(MAIN, 9, false));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(held).toHaveLength(1);
    for (const answer of held.splice(0)) answer();
    await author;
    // The page takes only the author's selections, so the one it was not
    // given cannot supersede the author's.
    expect(
      published
        .filter((p) => p.userEvent)
        .map((p) => p.selectedRange.start.line),
    ).toEqual([5]);
  });
});

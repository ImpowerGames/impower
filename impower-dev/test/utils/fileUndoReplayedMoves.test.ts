import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  moveFile: vi.fn(),
  duringMove: [] as unknown[],
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      moveFile: mocks.moveFile,
      getFiles: async () => ({}),
      getFolders: async () => [],
      getRelativePath: (_: string, uri: string) => uri,
    },
    autoRenameFiles: () => false,
    window: {
      recordScriptChange: async () => undefined,
      recordAssetChange: async () => undefined,
    },
  },
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { recordMoves } = await import("../../src/modules/spark-editor/utils/fileUndo");
const { undo, redo, clearUndoHistory } = await import("../../src/modules/spark-editor/utils/undoManager");

const P = "Assets/Images/Portraits";
const moved = [
  { from: `${P}/ava.png`, to: `${P}/Cast/ava.png` },
  { from: `${P}/ava@night.png`, to: `${P}/Cast/ava@night.png` },
];
const back = [
  { from: `${P}/Cast/ava@night.png`, to: `${P}/ava@night.png` },
  { from: `${P}/Cast/ava.png`, to: `${P}/ava.png` },
];

describe("undoing and redoing a move", () => {
  beforeEach(() => {
    clearUndoHistory();
    vi.clearAllMocks();
    mocks.duringMove = [];
    workspace.movesReplayed.value = null;
    mocks.moveFile.mockImplementation(async () => {
      mocks.duringMove.push(workspace.movesReplayed.peek());
    });
  });

  it("names the files it moves back while it moves them, then says they have landed", async () => {
    recordMoves("p", moved, "ava", "Move");
    expect(await undo()).toBe(true);
    expect(mocks.duringMove).toEqual([
      { moves: back, settled: false },
      { moves: back, settled: false },
    ]);
    expect(workspace.movesReplayed.value).toEqual({ moves: back, settled: true });
  });

  it("names the files it moves again on Redo", async () => {
    recordMoves("p", moved, "ava", "Move");
    await undo();
    expect(await redo()).toBe(true);
    expect(workspace.movesReplayed.value).toEqual({ moves: moved, settled: true });
  });

  it("says the move has ended when the workspace refuses it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.moveFile.mockRejectedValue(new Error("refused"));
    recordMoves("p", moved, "ava", "Move");
    expect(await undo()).toBe(false);
    expect(workspace.movesReplayed.value).toEqual({ moves: back, settled: true });
  });
});

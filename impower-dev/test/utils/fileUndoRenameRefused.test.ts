import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  moveFile: vi.fn(),
  recordScriptChange: vi.fn(async () => undefined),
  recordAssetChange: vi.fn(async () => undefined),
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: { moveFile: mocks.moveFile },
    autoRenameFiles: () => false,
    window: {
      recordScriptChange: mocks.recordScriptChange,
      recordAssetChange: mocks.recordAssetChange,
    },
  },
}));

const { recordMove } = await import("../../src/modules/spark-editor/utils/fileUndo");
const { undo, canRedo, canUndo, clearUndoHistory } = await import(
  "../../src/modules/spark-editor/utils/undoManager"
);
const { snackbar } = await import("../../src/modules/spark-editor/utils/snackbar");

describe("undoing a move the workspace refuses", () => {
  beforeEach(() => {
    clearUndoHistory();
    snackbar.value = null;
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("says the target exists and keeps the step on the undo stack", async () => {
    mocks.moveFile.mockRejectedValue({
      code: -32603,
      message: "Cannot rename b to a: a already exists",
    });
    recordMove("p", "assets/a.png", "assets/b.png", false);
    expect(await undo()).toBe(false);
    expect(mocks.moveFile).toHaveBeenCalledWith("p", "assets/b.png", "assets/a.png");
    expect(snackbar.value?.message).toBe("Couldn't rename b.png: a.png already exists.");
    expect(canUndo.value).toBe(true);
    expect(canRedo.value).toBe(false);
    expect(mocks.recordScriptChange).not.toHaveBeenCalled();
  });
});

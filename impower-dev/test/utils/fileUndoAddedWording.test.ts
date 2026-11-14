import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { fs: { listTrash: async () => [] } },
}));

const { recordResolvedUpload } = await import("../../src/modules/spark-editor/utils/fileUndo");
const { nextUndoLabel, clearUndoHistory } = await import("../../src/modules/spark-editor/utils/undoManager");
const { snackbar } = await import("../../src/modules/spark-editor/utils/snackbar");

beforeEach(() => {
  clearUndoHistory();
  snackbar.value = null;
});

describe("the words for files added to a project", () => {
  it("labels the undo step and the snackbar for added files with Add", async () => {
    await recordResolvedUpload("p", ["file://p/Assets/Images/ava.png"], [], 0, "ava.png");
    expect(nextUndoLabel.value).toBe("Add ava.png");
    expect(snackbar.value?.message).toBe("Added ava.png");
  });

  it("says Not added when every file was refused and only replaced files moved to the recycle bin", async () => {
    await recordResolvedUpload("p", [], ["file://p/Assets/Images/ava.png"], 0, "ava.png");
    expect(nextUndoLabel.value).toBe("Add ava.png");
    expect(snackbar.value?.message).toBe("Not added — replaced files moved to recycle bin");
  });
});

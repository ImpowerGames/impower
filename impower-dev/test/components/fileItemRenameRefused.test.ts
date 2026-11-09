import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refusal = { code: -32603, message: "Cannot rename x to y: y already exists" };

const mocks = vi.hoisted(() => ({
  moveFile: vi.fn(),
  moveFolder: vi.fn(),
  getFileReferences: vi.fn(async () => []),
  recordAssetChange: vi.fn(async () => undefined),
  recordScriptChange: vi.fn(async () => undefined),
  recordMove: vi.fn(),
}));

vi.mock("@impower/impower-ui/components", () => {
  const Pass = ({ children }: { children?: unknown }) =>
    h("div", null, children as never);
  const Empty = () => null;
  const wrappers = new Set(["Button", "DropdownRoot", "DropdownTrigger"]);
  return new Proxy(
    {},
    {
      has: (_, key) => key !== "then",
      get: (_, key) =>
        key === "then"
          ? undefined
          : wrappers.has(String(key))
            ? Pass
            : Empty,
    },
  );
});

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      moveFile: mocks.moveFile,
      moveFolder: mocks.moveFolder,
      getFileUri: (projectId: string, path: string) => `file://${projectId}/${path}`,
    },
    ls: { getFileReferences: mocks.getFileReferences },
    window: {
      recordAssetChange: mocks.recordAssetChange,
      recordScriptChange: mocks.recordScriptChange,
    },
  },
}));

vi.mock("../../src/modules/spark-editor/utils/fileUndo", () => ({
  recordMove: mocks.recordMove,
  recordReferenceRename: vi.fn(),
  recordTrashDeletion: vi.fn(),
}));

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
});

const { default: FileItem } = await import(
  "../../src/modules/spark-editor/components/file-list/FileItem"
);
const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { snackbar } = await import("../../src/modules/spark-editor/utils/snackbar");

const hosts: HTMLElement[] = [];

const renameRow = async (path: string, isDirectory: boolean, name: string) => {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  await act(async () => {
    render(h(FileItem, { path, isDirectory, isNew: true }), host);
  });
  const input = host.querySelector("input")!;
  await act(async () => {
    input.value = name;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
};

describe("a file row rename the workspace refuses", () => {
  workspace.state.value = {
    ...workspace.state.value,
    project: { ...workspace.state.value.project, id: "p" },
  };

  beforeEach(() => {
    snackbar.value = null;
    mocks.moveFile.mockRejectedValue(refusal);
    mocks.moveFolder.mockRejectedValue(refusal);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.clearAllMocks();
    for (const host of hosts.splice(0)) {
      await act(async () => {
        render(null, host);
      });
      host.remove();
    }
  });

  it("says the target exists and records no undo step for a file", async () => {
    await renameRow("assets/a.png", false, "b");
    expect(mocks.moveFile).toHaveBeenCalledWith("p", "assets/a.png", "assets/b.png");
    expect(snackbar.value?.message).toBe("Couldn't rename a.png: b.png already exists.");
    expect(mocks.recordMove).not.toHaveBeenCalled();
    expect(mocks.recordAssetChange).not.toHaveBeenCalled();
  });

  it("says the target exists and records no undo step for a folder", async () => {
    await renameRow("assets/a", true, "b");
    expect(mocks.moveFolder).toHaveBeenCalledWith("p", "assets/a", "assets/b");
    expect(snackbar.value?.message).toBe("Couldn't rename a: b already exists.");
    expect(mocks.recordMove).not.toHaveBeenCalled();
    expect(mocks.recordAssetChange).not.toHaveBeenCalled();
  });
});

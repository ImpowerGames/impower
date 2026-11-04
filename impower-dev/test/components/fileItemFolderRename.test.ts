import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  moveFolder: vi.fn(async () => []),
  recordAssetChange: vi.fn(async () => undefined),
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
    fs: { moveFolder: mocks.moveFolder },
    window: { recordAssetChange: mocks.recordAssetChange },
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

const hosts: HTMLElement[] = [];

const renameFolderRow = async (path: string, name: string) => {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  await act(async () => {
    render(h(FileItem, { path, isDirectory: true, isNew: true }), host);
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

describe("renaming a folder row", () => {
  afterEach(async () => {
    vi.clearAllMocks();
    for (const host of hosts.splice(0)) {
      await act(async () => {
        render(null, host);
      });
      host.remove();
    }
  });

  workspace.state.value = {
    ...workspace.state.value,
    project: { ...workspace.state.value.project, id: "p" },
  };

  it("moves the folder and records the move for undo", async () => {
    await renameFolderRow("assets/a", "b");
    expect(mocks.moveFolder).toHaveBeenCalledWith("p", "assets/a", "assets/b");
    expect(mocks.recordMove).toHaveBeenCalledWith("p", "assets/a", "assets/b", true);
  });

  it("neither moves nor records undo for a name that puts the folder inside itself", async () => {
    await renameFolderRow("assets/a", "a/inner");
    await renameFolderRow("assets/a", "a/");
    expect(mocks.moveFolder).not.toHaveBeenCalled();
    expect(mocks.recordMove).not.toHaveBeenCalled();
  });
});

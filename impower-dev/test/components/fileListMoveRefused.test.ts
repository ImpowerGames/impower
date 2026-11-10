import { signal } from "@preact/signals";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({
  getFiles: vi.fn(async () => ({
    "file://p/assets/a.png": { uri: "file://p/assets/a.png", type: "image", name: "a", ext: "png" },
  })),
  getFolders: vi.fn(async () => ["assets/f"] as string[]),
  getFileUri: (projectId: string, path: string) => `file://${projectId}/${path}`,
  getRelativePath: (projectId: string, uri: string) =>
    uri.slice(`file://${projectId}/`.length),
  moveFile: vi.fn(async () => {
    throw { code: -32603, message: "Cannot rename a to f/a: f/a already exists" };
  }),
}));

const mocks = vi.hoisted(() => ({
  recordScriptChange: vi.fn(async () => undefined),
  recordAssetChange: vi.fn(async () => undefined),
  recordMove: vi.fn(),
  drag: {} as { onDropInto?: (folderPath: string, srcPaths: string[]) => void },
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

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    scrollOffset: 0,
    getTotalSize: () => count * 64,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 64,
        size: 64,
      })),
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  }),
}));

vi.mock(
  "../../src/modules/spark-editor/components/file-list/useTreeDrag",
  async (importOriginal) => {
    const actual = await importOriginal<{ useTreeDrag: (opts: unknown) => unknown }>();
    return {
      ...actual,
      useTreeDrag: (opts: { onDropInto: (folderPath: string, srcPaths: string[]) => void }) => {
        mocks.drag.onDropInto = opts.onDropInto;
        return actual.useTreeDrag(opts);
      },
    };
  },
);

vi.mock("../../src/modules/spark-editor/workspace/WorkspaceStore", () => ({
  default: {
    signals: {
      projectId: signal("p"),
      syncStatus: signal("idle"),
    },
    state: signal({}),
    trashOpen: signal(false),
  },
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs,
    window: {
      openFileEditor: vi.fn(),
      recordScriptChange: mocks.recordScriptChange,
      recordAssetChange: mocks.recordAssetChange,
    },
  },
}));

vi.mock("../../src/modules/spark-editor/utils/fileUndo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recordMove: mocks.recordMove,
}));

const { default: FileList } = await import(
  "../../src/modules/spark-editor/components/file-list/FileList"
);
const { snackbar } = await import("../../src/modules/spark-editor/utils/snackbar");

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};

describe("dragging a file onto a folder that already holds its name", () => {
  const host = document.createElement("div");

  afterEach(async () => {
    await act(async () => {
      render(null, host);
    });
    host.remove();
  });

  it("says the target exists and records no undo step", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    snackbar.value = null;
    document.body.append(host);
    await act(async () => {
      render(h(FileList, { rootDir: "assets" }), host);
    });
    await settle();
    await act(async () => {
      mocks.drag.onDropInto?.("assets/f", ["assets/a.png"]);
    });
    await settle();
    expect(fs.moveFile).toHaveBeenCalledWith("p", "assets/a.png", "assets/f/a.png");
    expect(snackbar.value?.message).toBe("Couldn't rename a.png: a.png already exists.");
    expect(mocks.recordMove).not.toHaveBeenCalled();
    expect(mocks.recordAssetChange).not.toHaveBeenCalled();
  });
});

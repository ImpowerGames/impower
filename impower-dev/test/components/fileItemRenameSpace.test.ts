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
  const NativeButton = ({
    children,
    onClick,
  }: {
    children?: unknown;
    onClick?: (e: MouseEvent) => void;
  }) => h("button", { onClick }, children as never);
  const Empty = () => null;
  const wrappers = new Set(["DropdownRoot", "DropdownTrigger"]);
  return new Proxy(
    {},
    {
      has: (_, key) => key !== "then",
      get: (_, key) =>
        key === "then"
          ? undefined
          : key === "Button"
            ? NativeButton
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

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

const typeKey = async (input: HTMLInputElement, key: string) => {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
  if (key.length === 1) {
    await act(async () => {
      input.value += key;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await act(async () => {
    const keyup = new KeyboardEvent("keyup", {
      key,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(keyup);
    const button = input.closest("button");
    if (key === " " && button && !keyup.defaultPrevented) {
      button.click();
    }
  });
};

describe("typing a space into a folder row's rename field", () => {
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

  it("keeps the rename open and commits the whole name on Enter", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    hosts.push(host);
    await act(async () => {
      render(h(FileItem, { path: "assets/a", isDirectory: true, isNew: true }), host);
    });
    const input = host.querySelector("input")!;
    await act(async () => {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    for (const key of "Brand New") {
      await typeKey(input, key);
    }
    await settle();
    expect(mocks.moveFolder).not.toHaveBeenCalled();
    expect(host.querySelector("input")).toBe(input);
    await typeKey(input, "Enter");
    await settle();
    expect(mocks.moveFolder).toHaveBeenCalledWith("p", "assets/a", "assets/Brand New");
  });
});

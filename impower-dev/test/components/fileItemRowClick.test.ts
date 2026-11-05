import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FileItem from "../../src/modules/spark-editor/components/file-list/FileItem";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const mocks = vi.hoisted(() => ({
  moveFile: (() => {}) as (...args: unknown[]) => Promise<unknown[]>,
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    ls: { getFileReferences: async () => [] },
    fs: {
      getFileUri: (_projectId: string, path: string) => path,
      moveFile: (...args: unknown[]) => mocks.moveFile(...args),
    },
    window: {
      recordAssetChange: async () => {},
      recordScriptChange: async () => {},
      openFileEditor: () => {},
    },
  },
}));

vi.mock("@impower/impower-ui/components", async () => {
  const { h } = await import("preact");
  const pass = ({ children }: { children?: unknown }) => children ?? null;
  const icon = () => null;
  return {
    Button: ({ variant: _variant, ...props }: Record<string, unknown>) =>
      h("button", props),
    Check: icon,
    DotsVertical: icon,
    Pencil: icon,
    Search: icon,
    X: icon,
    ChevronRight: icon,
    Download: icon,
    FolderFill: icon,
    Trash: icon,
    DropdownContent: pass,
    DropdownItem: ({
      onSelect,
      children,
    }: {
      onSelect?: () => void;
      children?: unknown;
    }) => h("button", { "data-menu-item": "", onClick: onSelect }, children as never),
    DropdownRoot: pass,
    DropdownTrigger: pass,
  };
});

let host: HTMLDivElement | null = null;
const initialState = workspace.state.value;

beforeEach(() => {
  workspace.state.value = { ...initialState, project: { id: "project" } } as never;
});

afterEach(() => {
  if (host) {
    render(null, host);
    host.remove();
    host = null;
  }
  workspace.state.value = initialState;
});

function mountRows(paths: string[], props: Record<string, unknown>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    render(
      h(
        "div",
        null,
        paths.map((path) =>
          h(FileItem, {
            key: path,
            path,
            isDirectory: !path.includes("."),
            ...props,
          }),
        ),
      ),
      host!,
    );
  });
  return Array.from(
    host.querySelectorAll<HTMLElement>(":scope > div > div"),
  ).map((row) => ({
    row,
    button: row.querySelector<HTMLButtonElement>(":scope > button")!,
  }));
}

function startRename(row: HTMLElement, value: string) {
  act(() => {
    row
      .querySelector('[aria-label="Options"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const rename = Array.from(
    row.querySelectorAll<HTMLButtonElement>("[data-menu-item]"),
  ).find((item) => item.textContent?.includes("Rename"))!;
  act(() => {
    rename.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const input = row.querySelector("input")!;
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("FileItem row click", () => {
  it("bubbles a plain row click to ancestors and replaces the selection", () => {
    const onReplaceSelect = vi.fn();
    const rows = mountRows(["a", "b"], { onReplaceSelect });
    const ancestor = vi.fn();
    host!.addEventListener("click", ancestor);
    act(() => {
      rows[1]!.button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(ancestor).toHaveBeenCalledTimes(1);
    expect(onReplaceSelect).toHaveBeenCalledWith("b");
  });

  it("bubbles a Ctrl row click to ancestors and toggles the selection", () => {
    const onToggleSelect = vi.fn();
    const rows = mountRows(["a", "b"], { onToggleSelect });
    const ancestor = vi.fn();
    host!.addEventListener("click", ancestor);
    act(() => {
      rows[1]!.button.dispatchEvent(
        new MouseEvent("click", { bubbles: true, ctrlKey: true }),
      );
    });
    expect(ancestor).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith("b", true);
  });

  it.each([
    ["plain", false],
    ["Ctrl", true],
  ])(
    "commits an active rename when another row gets a %s click",
    async (_label, ctrlKey) => {
      const moveFile = vi.fn(async () => []);
      mocks.moveFile = moveFile;
      const onReplaceSelect = vi.fn();
      const onToggleSelect = vi.fn();
      const onOpenFile = vi.fn();
      const rows = mountRows(["a.png", "b.png"], {
        onReplaceSelect,
        onToggleSelect,
        onOpenFile,
      });
      startRename(rows[0]!.row, "renamed");
      act(() => {
        rows[1]!.button.dispatchEvent(
          new MouseEvent("click", { bubbles: true, ctrlKey }),
        );
      });
      await vi.waitFor(() =>
        expect(moveFile).toHaveBeenCalledWith("project", "a.png", "renamed.png"),
      );
      expect(rows[0]!.row.querySelector("input")).toBeNull();
      if (ctrlKey) {
        expect(onToggleSelect).toHaveBeenCalledWith("b.png", false);
        expect(onReplaceSelect).not.toHaveBeenCalled();
      } else {
        expect(onReplaceSelect).toHaveBeenCalledWith("b.png");
        expect(onOpenFile).toHaveBeenCalledWith("b.png");
      }
    },
  );
});

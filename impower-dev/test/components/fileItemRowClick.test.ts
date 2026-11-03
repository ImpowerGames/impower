import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import FileItem from "../../src/modules/spark-editor/components/file-list/FileItem";

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
    Ripple: icon,
    DropdownContent: pass,
    DropdownItem: pass,
    DropdownRoot: pass,
    DropdownTrigger: pass,
  };
});

let host: HTMLDivElement | null = null;

afterEach(() => {
  if (host) {
    render(null, host);
    host.remove();
    host = null;
  }
});

function mountRows(props: Record<string, unknown>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    render(
      h("div", null, [
        h(FileItem, { key: "a", path: "a", isDirectory: true, ...props }),
        h(FileItem, { key: "b", path: "b", isDirectory: true, ...props }),
      ]),
      host!,
    );
  });
  return Array.from(
    host.querySelectorAll<HTMLButtonElement>(":scope > div > div > button"),
  );
}

describe("FileItem row click", () => {
  it("bubbles a plain row click to ancestors and replaces the selection", () => {
    const onReplaceSelect = vi.fn();
    const rows = mountRows({ onReplaceSelect });
    const ancestor = vi.fn();
    host!.addEventListener("click", ancestor);
    act(() => {
      rows[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(ancestor).toHaveBeenCalledTimes(1);
    expect(onReplaceSelect).toHaveBeenCalledWith("b");
  });

  it("bubbles a Ctrl row click to ancestors and toggles the selection", () => {
    const onToggleSelect = vi.fn();
    const rows = mountRows({ onToggleSelect });
    const ancestor = vi.fn();
    host!.addEventListener("click", ancestor);
    act(() => {
      rows[1]!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, ctrlKey: true }),
      );
    });
    expect(ancestor).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith("b", true);
  });
});

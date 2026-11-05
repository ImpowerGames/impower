import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      getFileUri: (_projectId: string, path: string) => `file:///${path}`,
      getRelativePath: (_projectId: string, uri: string) => uri,
    },
    ls: {
      getFileReferences: async () => [
        {
          uri: "file:///main.sd",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
        },
      ],
    },
  },
}));

vi.mock("../../src/modules/spark-editor/utils/fileUndo", () => ({
  recordMove: vi.fn(),
  recordReferenceRename: vi.fn(),
  recordTrashDeletion: vi.fn(),
}));

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
});

const { default: FileItem } =
  await import("../../src/modules/spark-editor/components/file-list/FileItem");
const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");

workspace.state.value = {
  ...workspace.state.value,
  project: { ...workspace.state.value.project, id: "p" },
};

const hosts: HTMLElement[] = [];

const settle = (ms = 30) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const press = (element: Element, key: string) =>
  act(async () => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

const mountRow = async () => {
  const host = document.body.appendChild(document.createElement("div"));
  hosts.push(host);
  await act(async () => {
    render(h(FileItem, { path: "assets/bunny.svg" }), host);
  });
  return host;
};

const chooseFromRowMenu = async (host: HTMLElement, label: string) => {
  const options = host.querySelector<HTMLButtonElement>(
    '[aria-label="Options"]',
  )!;
  options.focus();
  await act(async () => options.click());
  await settle(80);
  const item = Array.from(
    document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).find((node) => node.textContent?.trim() === label)!;
  item.focus();
  await act(async () => item.click());
};

const closeWithEscape = async () => {
  await press(document.activeElement!, "Escape");
  await settle(300);
  await settle(20);
  expect(dialog()).toBeNull();
};

describe("an asset row's dialogs return focus to the row", () => {
  afterEach(async () => {
    for (const host of hosts.splice(0)) {
      await act(async () => {
        render(null, host);
      });
      host.remove();
    }
    document.body.innerHTML = "";
    document.body.removeAttribute("style");
  });

  it("returns from Find usages to the row's Options button after its menu has closed", async () => {
    const host = await mountRow();
    await chooseFromRowMenu(host, "Find usages");
    await settle(450);
    expect(dialog()?.textContent).toContain("Used in 1 place");
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    await closeWithEscape();
    expect(document.activeElement).toBe(
      host.querySelector('[aria-label="Options"]'),
    );
  });

  it("returns from the rename confirmation to the row's Options button after the name field closes", async () => {
    const host = await mountRow();
    await chooseFromRowMenu(host, "Rename");
    await settle(350);
    const input = host.querySelector("input")!;
    input.focus();
    await act(async () => {
      input.value = "bunny2";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await press(input, "Enter");
    await settle(100);
    expect(dialog()?.textContent).toContain("Update references?");
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    await closeWithEscape();
    expect(document.activeElement).toBe(
      host.querySelector('[aria-label="Options"]'),
    );
  });
});

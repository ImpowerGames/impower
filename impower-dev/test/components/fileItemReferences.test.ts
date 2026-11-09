import { signal } from "@preact/signals";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const preferences = signal({ autoRenameFiles: true });
const references = vi.fn(async () => [
  {
    uri: "file:///main.sd",
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 5 },
    },
  },
]);
const moveFile = vi.fn(async () => [{ type: "image" }]);
const renameFileWithReferences = vi.fn(async () => ({
  referencesUpdated: 1,
  scriptsAffected: 1,
}));
const openReferences = vi.fn(async () => {});

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    settings: { preferences },
    fs: {
      getFileUri: (_projectId: string, path: string) => `file:///${path}`,
      getRelativePath: (_projectId: string, uri: string) => uri,
      moveFile,
      renameFileWithReferences,
    },
    ls: { getFileReferences: references },
    window: {
      recordScriptChange: async () => {},
      recordAssetChange: async () => {},
    },
    search: { openReferences },
  },
}));

const undo = vi.hoisted(() => ({
  recordMove: vi.fn(),
  recordReferenceRename: vi.fn(),
  recordTrashDeletion: vi.fn(),
}));
vi.mock("../../src/modules/spark-editor/utils/fileUndo", () => undo);

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

const mountRow = async (path: string) => {
  const host = document.body.appendChild(document.createElement("div"));
  hosts.push(host);
  await act(async () => {
    render(h(FileItem, { path }), host);
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

const renameRowTo = async (host: HTMLElement, name: string) => {
  await chooseFromRowMenu(host, "Rename");
  await settle(350);
  const input = host.querySelector("input")!;
  input.focus();
  await act(async () => {
    input.value = name;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
  });
  await settle(100);
};

describe("an asset row's rename and usages", () => {
  beforeEach(() => {
    preferences.value = { autoRenameFiles: true };
    vi.clearAllMocks();
  });

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

  it("renames a used picture and the lines that use it when Auto-rename files is on, asking nothing", async () => {
    const host = await mountRow("assets/bunny.svg");
    await renameRowTo(host, "rabbit");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(renameFileWithReferences).toHaveBeenCalledWith(
      "p",
      "assets/bunny.svg",
      "assets/rabbit.svg",
    );
    expect(moveFile).not.toHaveBeenCalled();
    expect(undo.recordReferenceRename).toHaveBeenCalledWith(
      "p",
      "assets/bunny.svg",
      "assets/rabbit.svg",
    );
  });

  it("renames only the file when Auto-rename files is off", async () => {
    preferences.value = { autoRenameFiles: false };
    const host = await mountRow("assets/bunny.svg");
    await renameRowTo(host, "rabbit");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(moveFile).toHaveBeenCalledWith(
      "p",
      "assets/bunny.svg",
      "assets/rabbit.svg",
    );
    expect(renameFileWithReferences).not.toHaveBeenCalled();
    expect(undo.recordMove).toHaveBeenCalledWith(
      "p",
      "assets/bunny.svg",
      "assets/rabbit.svg",
      false,
    );
  });

  it("keeps a renamed script's includes whatever Auto-rename files says", async () => {
    preferences.value = { autoRenameFiles: false };
    const host = await mountRow("scripts/chapter.sd");
    await renameRowTo(host, "prologue");
    expect(renameFileWithReferences).toHaveBeenCalledWith(
      "p",
      "scripts/chapter.sd",
      "scripts/prologue.sd",
    );
  });

  it("opens the References view for the asset's name from Find usages", async () => {
    const host = await mountRow("assets/bunny.svg");
    await chooseFromRowMenu(host, "Find usages");
    await settle(50);
    expect(openReferences).toHaveBeenCalledWith({
      name: "bunny",
      character: false,
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

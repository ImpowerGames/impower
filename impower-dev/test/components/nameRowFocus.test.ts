import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({ value: "desktop" as "phone" | "desktop" }));
vi.mock("../../../packages/impower-ui/src/hooks/useLayout", () => ({
  useLayout: () => layout.value,
}));
vi.mock("@impower/impower-ui/layout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@impower/impower-ui/layout")>()),
  useLayout: () => layout.value,
}));

const scripts = vi.hoisted(() => ({
  watch: vi.fn(() => () => {}),
  remove: vi.fn(async () => undefined),
  referencing: vi.fn(async (): Promise<string[] | null> => []),
  move: vi.fn(async (paths: string[]) => paths),
  download: vi.fn(async () => undefined),
  duplicate: vi.fn(async () => ""),
  rename: vi.fn(async () => ""),
  createScript: vi.fn(async () => "Scripts/Untitled script.sd"),
  createFolder: vi.fn(async () => ""),
}));
const assets = vi.hoisted(() => ({
  watch: vi.fn(() => () => {}),
  upload: vi.fn(async (): Promise<string[]> => []),
  addLink: vi.fn(async () => ""),
  createFolder: vi.fn(async () => ""),
  rename: vi.fn(async (path: string) => path),
  remove: vi.fn(async () => undefined),
  move: vi.fn(async (): Promise<{ from: string; to: string }[]> => []),
  usedBy: vi.fn(async (): Promise<unknown[] | null> => []),
  downloadAll: vi.fn(async () => undefined),
  measureImages: vi.fn(async (_paths: string[]) => undefined),
  watchFacts: vi.fn(() => () => {}),
}));
const window = vi.hoisted(() => ({
  openScript: vi.fn(),
  writeScript: vi.fn(async () => undefined),
  setListState: vi.fn(),
  navigateTo: vi.fn(),
  openTrash: vi.fn(),
  revealDocument: vi.fn(),
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { scripts, assets, window },
}));

(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { NameError } = await import("../../src/modules/spark-editor/utils/fileListModel");
const { default: ScriptsPage } = await import("../../src/modules/spark-editor/components/scripts-page");
const { default: Assets } = await import("../../src/modules/spark-editor/components/assets");
const { setAssetFiles } = await import("../../src/modules/spark-editor/utils/assetTypes");
const { PROJECT_SETTINGS_SCHEMA } = await import(
  "../../src/modules/spark-editor/workspace/settings/settingsSchema"
);

const PROJECT = "p";
let host: HTMLDivElement | undefined;

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const mount = async (page: typeof ScriptsPage | typeof Assets) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(page, {}), host!));
  await settle();
};

const all = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)];

const openMenu = async (trigger: HTMLElement | undefined) => {
  expect(trigger).toBeTruthy();
  trigger!.focus();
  await act(async () => {
    if (layout.value === "phone") {
      trigger!.click();
    } else {
      trigger!.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }),
      );
    }
  });
  await settle(50);
};

const type = (text: string) => {
  for (const ch of text) {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement) {
      el.setRangeText(ch, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
};

const chooseAndType = async (name: string, label: string) => {
  const item = all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.trim() === name);
  expect(item).toBeTruthy();
  item!.focus();
  item!.click();
  await Promise.resolve();
  type("f12");
  await settle(400);
  await act(async () => type("345"));
  const input = host!.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  expect(input.value).toBe("f12345");
  expect(document.activeElement).toBe(input);
  return input;
};

const escape = async (input: HTMLInputElement) => {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  await settle(400);
};

const newButton = () => all<HTMLButtonElement>("button").find((b) => b.textContent?.trim() === "New")!;

beforeEach(() => {
  for (const fn of [...Object.values(scripts), ...Object.values(assets), ...Object.values(window)]) fn.mockClear();
  workspace.assetSizes.value = {};
  assets.measureImages.mockImplementation(async (paths: string[]) => {
    const files = workspace.assetListing.value!.files;
    workspace.assetSizes.value = {
      ...workspace.assetSizes.value,
      ...Object.fromEntries(paths.map((path) => [files[path]!.src!, null])),
    };
  });
  window.setListState.mockImplementation((lists) => {
    workspace.current = { ...workspace.current, lists: { ...workspace.current.lists, ...lists } };
  });
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: PROJECT },
    lists: { scriptsFolder: "" },
  };
  workspace.scriptListing.value = {
    projectId: PROJECT,
    files: { "main.sd": { modified: 1, size: 10 }, "intro.sd": { modified: 1, size: 10 } },
    folders: [],
  };
  workspace.scriptReferences.value = [];
  setAssetFiles({
    imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
    audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
    videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
    fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
  });
  workspace.assetListing.value = {
    projectId: PROJECT,
    files: { "Assets/Images/bunny.png": { modified: 1, size: 600, src: "/p/600" } },
    folders: [],
  };
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
});

describe.each(["desktop", "phone"] as const)("the name row opened from a menu, %s layout", (width) => {
  beforeEach(() => {
    layout.value = width;
  });

  it("Scripts New > Folder keeps every keystroke typed at once, and Escape returns focus to New", async () => {
    await mount(ScriptsPage);
    await openMenu(newButton());
    const input = await chooseAndType("Folder", "New folder name");
    await escape(input);
    expect(host!.querySelector('input[aria-label="New folder name"]')).toBeNull();
    expect(document.activeElement).toBe(newButton());
  });

  it("Scripts New > Script creates the script at once and opens it to write, with no name row", async () => {
    await mount(ScriptsPage);
    await openMenu(newButton());
    const item = all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.trim() === "Script");
    await act(async () => item!.click());
    await settle();
    expect(host!.querySelector('input[aria-label^="New "]')).toBeNull();
    expect(scripts.createScript).toHaveBeenCalledWith("");
    expect(window.writeScript).toHaveBeenCalledWith("Scripts/Untitled script.sd");
  });

  it("says so when a new script is refused while the scripts load, and the next New > Script makes it", async () => {
    const { SCRIPTS_LOADING } = await import("../../src/modules/spark-editor/workspace/WorkspaceScripts");
    const { snackbar } = await import("../../src/modules/spark-editor/utils/snackbar");
    scripts.createScript.mockRejectedValueOnce(new NameError(SCRIPTS_LOADING));
    await mount(ScriptsPage);
    const choose = async () => {
      await openMenu(newButton());
      const item = all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.trim() === "Script");
      await act(async () => item!.click());
      await settle();
    };
    await choose();
    expect(snackbar.value?.message).toBe(SCRIPTS_LOADING);
    expect(window.writeScript).not.toHaveBeenCalled();
    await choose();
    expect(window.writeScript).toHaveBeenCalledWith("Scripts/Untitled script.sd");
  });

  it("an empty folder's New script button creates the script there at once and opens it to write", async () => {
    workspace.scriptListing.value = {
      projectId: PROJECT,
      files: { "main.sd": { modified: 1, size: 10 } },
      folders: ["Scripts", "Scripts/Empty"],
    };
    workspace.current = { ...workspace.current, lists: { scriptsFolder: "Scripts/Empty" } };
    await mount(ScriptsPage);
    const button = all<HTMLButtonElement>("button").find((b) => b.textContent?.trim() === "New script");
    await act(async () => button!.click());
    await settle();
    expect(host!.querySelector('input[aria-label^="New "]')).toBeNull();
    expect(scripts.createScript).toHaveBeenCalledWith("Scripts/Empty");
    expect(window.writeScript).toHaveBeenCalledWith("Scripts/Untitled script.sd");
  });

  it("Scripts row Rename keeps every keystroke typed at once, and Escape returns focus to the row", async () => {
    await mount(ScriptsPage);
    await openMenu(all<HTMLElement>('button[aria-label="Options for intro.sd"]')[0]);
    const input = await chooseAndType("Rename", "Rename intro.sd");
    await escape(input);
    expect(document.activeElement).toBe(host!.querySelector('[data-script-path="intro.sd"]'));
  });

  it("Assets New > New folder keeps every keystroke typed at once, and Escape returns focus to New", async () => {
    await mount(Assets);
    await openMenu(host!.querySelector<HTMLElement>('[data-assets-action="add"]')!);
    const input = await chooseAndType("New folder", "New folder name");
    await escape(input);
    expect(document.activeElement).toBe(host!.querySelector('[data-assets-action="add"]'));
  });

  it("Assets row Rename keeps every keystroke typed at once, and Escape returns focus to the row", async () => {
    await mount(Assets);
    await openMenu(all<HTMLElement>('button[aria-label="Options for bunny"]')[0]);
    const input = await chooseAndType("Rename", "Rename bunny");
    await escape(input);
    expect(document.activeElement).toBe(host!.querySelector('[data-asset-path="Assets/Images/bunny.png"]'));
  });
});

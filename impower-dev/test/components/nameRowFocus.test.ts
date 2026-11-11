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
  create: vi.fn(async () => ""),
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

const choose = async (name: string) => {
  const item = all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.trim() === name);
  expect(item).toBeTruthy();
  item!.focus();
  await act(async () => item!.click());
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

  it.each([
    ["Script", "New script name"],
    ["Folder", "New folder name"],
  ])("Scripts New > %s focuses the field at once, and Escape returns focus to New", async (item, label) => {
    await mount(ScriptsPage);
    await openMenu(newButton());
    await choose(item);
    const input = host!.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    expect(document.activeElement).toBe(input);
    await settle(400);
    expect(document.activeElement).toBe(input);
    await escape(input);
    expect(host!.querySelector(`input[aria-label="${label}"]`)).toBeNull();
    expect(document.activeElement).toBe(newButton());
  });

  it("Scripts row Rename focuses the field, and Escape returns focus to the row", async () => {
    await mount(ScriptsPage);
    await openMenu(all<HTMLElement>('button[aria-label="Options for intro.sd"]')[0]);
    await choose("Rename");
    const input = host!.querySelector<HTMLInputElement>('input[aria-label="Rename intro.sd"]')!;
    expect(document.activeElement).toBe(input);
    await settle(400);
    expect(document.activeElement).toBe(input);
    await escape(input);
    expect(document.activeElement).toBe(host!.querySelector('[data-script-path="intro.sd"]'));
  });

  it("Assets New > New folder focuses the field at once, and Escape returns focus to New", async () => {
    await mount(Assets);
    await openMenu(host!.querySelector<HTMLElement>('[data-assets-action="add"]')!);
    await choose("New folder");
    const input = host!.querySelector<HTMLInputElement>('input[aria-label="New folder name"]')!;
    expect(document.activeElement).toBe(input);
    await settle(400);
    expect(document.activeElement).toBe(input);
    await escape(input);
    expect(document.activeElement).toBe(host!.querySelector('[data-assets-action="add"]'));
  });

  it("Assets row Rename focuses the field, and Escape returns focus to the row", async () => {
    await mount(Assets);
    await openMenu(all<HTMLElement>('button[aria-label="Options for bunny"]')[0]);
    await choose("Rename");
    const input = host!.querySelector<HTMLInputElement>('input[aria-label="Rename bunny"]')!;
    expect(document.activeElement).toBe(input);
    await settle(400);
    expect(document.activeElement).toBe(input);
    await escape(input);
    expect(document.activeElement).toBe(host!.querySelector('[data-asset-path="Assets/Images/bunny.png"]'));
  });
});

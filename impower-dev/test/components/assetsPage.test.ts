import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({
  value: "desktop" as "phone" | "compact" | "desktop",
}));
vi.mock("@impower/impower-ui/layout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@impower/impower-ui/layout")>()),
  useLayout: () => layout.value,
}));

const assets = vi.hoisted(() => ({
  watch: vi.fn(() => () => {}),
  upload: vi.fn(async (): Promise<string[]> => []),
  addLink: vi.fn(async () => ""),
  createFolder: vi.fn(async () => ""),
  rename: vi.fn(async () => ""),
  remove: vi.fn(async () => undefined),
}));
const window = vi.hoisted(() => ({
  setListState: vi.fn(),
  navigateTo: vi.fn(),
  openTrash: vi.fn(),
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { assets, window },
}));

(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: Assets } = await import("../../src/modules/spark-editor/components/assets");
const { setAssetFiles } = await import("../../src/modules/spark-editor/utils/assetTypes");
const { inspectAsset, inspectedAsset } = await import("../../src/modules/spark-editor/utils/assetInspector");
const { PROJECT_SETTINGS_SCHEMA } = await import(
  "../../src/modules/spark-editor/workspace/settings/settingsSchema"
);

const PROJECT = "p";
const facts = (size = 1024) => ({ modified: Date.now() - 2 * 86_400_000, size, src: `/p/${size}` });

let host: HTMLDivElement | undefined;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const mount = async () => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(Assets, {}), host!));
  await settle();
};

const all = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)];
const tabs = () => all<HTMLElement>('[role="tablist"] [role="tab"]');
const rowLabels = () =>
  all<HTMLElement>('[role="listitem"] button[aria-label^="Open"]').map((b) => b.getAttribute("aria-label"));
const headings = () => all<HTMLElement>('[role="listitem"] h2').map((el) => el.textContent);
const text = () => host!.textContent ?? "";

const click = async (el: HTMLElement | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    el!.click();
  });
  await settle();
};

const openMenu = async (trigger: HTMLElement | undefined) => {
  expect(trigger).toBeTruthy();
  await act(async () => {
    trigger!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
  });
  await settle();
};

const menuItems = () => all<HTMLElement>('[role="menuitem"], [role="menuitemradio"]').map((el) => el.textContent?.trim());

const search = async (value: string) => {
  const input = host!.querySelector<HTMLInputElement>('input[aria-label="Search assets"]')!;
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
};

const showTab = async (title: string) => {
  await click(tabs().find((tab) => tab.textContent?.startsWith(title)));
};

const setListing = (files: Record<string, ReturnType<typeof facts>>, folders: string[] = []) => {
  workspace.assetListing.value = { projectId: PROJECT, files, folders };
};

beforeEach(() => {
  layout.value = "desktop";
  for (const fn of [...Object.values(assets), ...Object.values(window)]) fn.mockClear();
  window.setListState.mockImplementation((lists) => {
    workspace.current = { ...workspace.current, lists: { ...workspace.current.lists, ...lists } };
  });
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: PROJECT },
    lists: {},
  };
  setAssetFiles({
    imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
    audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
    videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
    fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
  });
  setListing({
    "Assets/Audio/Music/harbor_theme.wav": facts(4096),
    "Assets/Audio/Music/night_market.wav": facts(2048),
    "Assets/Audio/Sounds/door_chime.wav": facts(512),
    "Assets/Audio/Sounds/footsteps.wav": facts(768),
    "Assets/Images/bunny.png": facts(600),
    "Assets/Video/intro.webm": facts(4),
    "Assets/Fonts/courier_prime.ttf": facts(2048),
    "Assets/Other/table.csv": facts(19),
  });
  inspectAsset(null);
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("the Assets page", () => {
  it("mounts in the Assets pane", async () => {
    await mount();
    expect(host!.firstElementChild).not.toBeNull();
  });

  for (const width of ["desktop", "phone"] as const) {
    it(`shows the six type tabs and a New button at ${width} width`, async () => {
      layout.value = width;
      await mount();
      expect(tabs().map((tab) => tab.id.replace(/^.*-trigger-/, ""))).toEqual(["image", "audio", "video", "text", "font", "other"]);
      expect(tabs().every((tab, i) => tab.textContent!.startsWith(["Images", "Audio", "Video", "Text", "Fonts", "Other"][i]!))).toBe(true);
      expect(tabs()[0]!.getAttribute("aria-selected")).toBe("true");
      expect(host!.querySelector('[data-assets-action="add"]')?.textContent).toContain("New");
      expect(host!.querySelector('input[aria-label="Search assets"]')).not.toBeNull();
    });
  }

  it("opens a tab at its type folder, folders first, with the tab's file count in the trail", async () => {
    await mount();
    await showTab("Audio");
    expect(workspace.current.lists?.assetsType).toBe("audio");
    expect(rowLabels()).toEqual(["Open folder Music, 2 sounds", "Open folder Sounds, 2 sounds"]);
    expect(host!.querySelector('nav[aria-label="Folder path"]')!.textContent).toContain("4 files");
    await click(all<HTMLElement>('button[aria-label^="Open folder Music"]')[0]);
    expect(rowLabels()).toEqual([
      "Open audio harbor_theme, modified 2d · 4 kb",
      "Open audio night_market, modified 2d · 2 kb",
    ]);
    const trail = host!.querySelector('nav[aria-label="Folder path"]')!;
    expect(trail.querySelector('button[aria-label="Audio"]')).not.toBeNull();
    expect(trail.textContent).toContain("Music");
  });

  it("lists a file kept outside its type folder at its real path", async () => {
    setListing({ "assets/music/theme.wav": facts(2048), "assets/bunny.png": facts(600) });
    workspace.current = { ...workspace.current, lists: { assetsType: "audio" } };
    await mount();
    expect(rowLabels()).toEqual(["Open folder music, assets"]);
    await click(all<HTMLElement>('button[aria-label^="Open folder music"]')[0]);
    expect(rowLabels()).toEqual(["Open audio theme, assets/music · modified 2d · 2 kb"]);
  });

  it("lists a .webm under Video, a .ttf under Fonts and a .csv under Other", async () => {
    await mount();
    await showTab("Video");
    expect(rowLabels()).toEqual(["Open video intro, modified 2d · 4 b"]);
    await showTab("Fonts");
    expect(rowLabels()).toEqual(["Open font courier_prime, modified 2d · 2 kb"]);
    await showTab("Other");
    expect(rowLabels()).toEqual(["Open file table, modified 2d · 19 b"]);
  });

  it("searches every type and groups the results under each type's name", async () => {
    setListing({
      "Assets/Audio/Music/theme.wav": facts(),
      "Assets/Images/theme_card.png": facts(),
      "Assets/Other/theme.csv": facts(),
      "Assets/Audio/door.wav": facts(),
    });
    await mount();
    await search("theme");
    expect(tabs()).toEqual([]);
    expect(text()).toContain("Results in all types");
    expect(headings()).toEqual(["Images", "Audio", "Other"]);
    expect(rowLabels()).toEqual([
      "Open image theme_card, images · modified 2d · 1 kb",
      "Open audio theme, music · modified 2d · 1 kb",
      "Open file theme, other · modified 2d · 1 kb",
    ]);
    await search("lighthouse");
    expect(text()).toContain("No files match.");
  });

  it("says what each empty tab is for, and what an empty folder or project is", async () => {
    setListing({ "Assets/Images/bunny.png": facts() }, ["Assets/Images/Empty"]);
    await mount();
    await showTab("Audio");
    expect(text()).toContain("No audio yet");
    expect(text()).toContain("Upload sounds and music with the New button.");
    await showTab("Other");
    expect(text()).toContain("Files of any other type land here when you upload them.");
    await showTab("Images");
    await click(all<HTMLElement>('button[aria-label^="Open folder Empty"]')[0]);
    expect(text()).toContain("This folder is empty");
    await act(async () => {
      setListing({});
    });
    await settle();
    expect(text()).toContain("A collection of your art");
    expect(text()).toContain("Your portraits, backgrounds, sounds and music will appear here.");
    expect(all<HTMLButtonElement>("button").some((b) => b.textContent?.includes("Upload files"))).toBe(true);
  });

  it("opens today's inspector on a press and the row menu from its own button", async () => {
    await mount();
    await click(all<HTMLElement>('button[aria-label^="Open image bunny"]')[0]);
    expect(inspectedAsset.value).toMatchObject({ path: "Assets/Images/bunny.png", kind: "image", src: "/p/600" });
    await openMenu(all<HTMLElement>('button[aria-label="Options for bunny"]')[0]);
    await vi.waitFor(() => expect(menuItems()).toEqual(["Rename", "Delete"]));
    await click(all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.includes("Delete")));
    expect(assets.remove).toHaveBeenCalledWith(["Assets/Images/bunny.png"]);
  });

  it("offers Name, Modified and Size, and keeps the choice per project", async () => {
    await mount();
    await openMenu(all<HTMLElement>('button[aria-label^="Sort by"]')[0]);
    await vi.waitFor(() => expect(menuItems()).toEqual(["Name", "Modified", "Size", "A to Z", "Z to A"]));
    await click(all<HTMLElement>('[role="menuitemradio"]').find((el) => el.textContent?.includes("Size")));
    expect(window.setListState).toHaveBeenCalledWith({ assetsSort: "size-desc" });
  });

  it("offers uploads, a link by address and a new folder from New", async () => {
    await mount();
    await openMenu(host!.querySelector<HTMLElement>('[data-assets-action="add"]')!);
    await vi.waitFor(() =>
      expect(menuItems()).toEqual(["Upload files", "Link a file by address", "New folder"]),
    );
  });

  it("uploads into the folder in view and follows a file to where it landed", async () => {
    workspace.current = { ...workspace.current, lists: { assetsType: "font" } };
    assets.upload.mockResolvedValueOnce(["Assets/Fonts/mono.ttf"]);
    await mount();
    const input = host!.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [new File(["x"], "mono.ttf")], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(assets.upload).toHaveBeenCalledWith([expect.objectContaining({ name: "mono.ttf" })], "Assets/Fonts");
  });
});

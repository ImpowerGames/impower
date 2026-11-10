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
  renameStack: vi.fn(async (): Promise<string[]> => []),
  remove: vi.fn(async () => undefined),
  measureImages: vi.fn(async (_paths: string[]) => undefined),
}));
const measured = vi.hoisted(() => ({ sizes: {} as Record<string, { width: number; height: number }> }));
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
    await vi.dynamicImportSettled();
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

const setListing = (files: Record<string, ReturnType<typeof facts> & { address?: string }>, folders: string[] = []) => {
  workspace.assetListing.value = { projectId: PROJECT, files, folders };
};

beforeEach(() => {
  layout.value = "desktop";
  measured.sizes = {};
  workspace.assetSizes.value = {};
  assets.measureImages.mockImplementation(async (paths: string[]) => {
    const files = workspace.assetListing.value!.files;
    workspace.assetSizes.value = {
      ...workspace.assetSizes.value,
      ...Object.fromEntries(paths.map((path) => [files[path]!.src!, measured.sizes[path] ?? null])),
    };
  });
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

  const chooseFiles = async (...names: string[]) => {
    const input = host!.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: names.map((name) => new File(["x"], name)), configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
  };

  const selectedTab = () => tabs().find((tab) => tab.getAttribute("aria-selected") === "true")?.id.replace(/^.*-trigger-/, "");

  it("uploads into the folder in view and stays there when the file lands in it", async () => {
    workspace.current = { ...workspace.current, lists: { assetsType: "font" } };
    assets.upload.mockResolvedValueOnce(["Assets/Fonts/mono.ttf"]);
    await mount();
    await chooseFiles("mono.ttf");
    expect(assets.upload).toHaveBeenCalledWith([expect.objectContaining({ name: "mono.ttf" })], "Assets/Fonts");
    expect(selectedTab()).toBe("font");
    expect(window.setListState).not.toHaveBeenCalledWith(expect.objectContaining({ assetsType: expect.anything() }));
  });

  it("follows an upload that lands in another type's folder to that tab and folder", async () => {
    workspace.current = { ...workspace.current, lists: { assetsType: "font" } };
    assets.upload.mockImplementationOnce(async () => {
      setListing({ ...workspace.assetListing.value!.files, "Assets/Images/Portraits/bunny2.png": facts(700) });
      return ["Assets/Images/Portraits/bunny2.png"];
    });
    await mount();
    await chooseFiles("bunny2.png");
    expect(selectedTab()).toBe("image");
    expect(workspace.current.lists?.assetsFolders).toMatchObject({ image: "Assets/Images/Portraits" });
    expect(rowLabels()).toEqual(["Open image bunny2, modified 2d · 700 b"]);
  });

  it("follows a link to the tab of the type its address names", async () => {
    assets.addLink.mockImplementationOnce(async () => {
      setListing({ ...workspace.assetListing.value!.files, "Assets/Audio/horn.url": { ...facts(40), address: "https://cdn.example.com/horn.mp3" } });
      return "Assets/Audio/horn.url";
    });
    await mount();
    await openMenu(host!.querySelector<HTMLElement>('[data-assets-action="add"]')!);
    await vi.waitFor(() => expect(menuItems()).toContain("Link a file by address"));
    await click(all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.includes("Link a file by address")));
    const [url, name] = all<HTMLInputElement>('[role="dialog"] input');
    await act(async () => {
      url!.value = "https://cdn.example.com/horn.mp3";
      url!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(all<HTMLButtonElement>('[role="dialog"] button').find((b) => b.textContent?.trim() === "Add"));
    expect(assets.addLink).toHaveBeenCalledWith("https://cdn.example.com/horn.mp3", "horn", "Assets/Images");
    expect(name).toBeTruthy();
    expect(selectedTab()).toBe("audio");
    expect(workspace.current.lists?.assetsFolders).toMatchObject({ audio: "Assets/Audio" });
  });
});

describe("image folders as tiles", () => {
  const tiles = () => all<HTMLElement>('[role="listitem"] [data-tile]');
  const layoutButton = () => host!.querySelector<HTMLElement>('[data-assets-action="layout"]');

  beforeEach(() => {
    setListing({
      "Assets/Images/Portraits/imani.png": facts(100),
      "Assets/Images/Portraits/imani@night.png": facts(200),
      "Assets/Images/Portraits/imani~face.happy.png": facts(10),
      "Assets/Images/Portraits/imani@night~face.sad.png": facts(20),
      "Assets/Images/Backdrops/subway.png": facts(300),
      "Assets/Audio/imani.wav": facts(5),
    });
  });

  it("draws one portrait tile per thing, with the variants badge in its thumbnail's corner", async () => {
    workspace.current = { ...workspace.current, lists: { assetsFolders: { image: "Assets/Images/Portraits" } } };
    await mount();
    expect(tiles().map((tile) => tile.getAttribute("data-tile"))).toEqual(["portrait"]);
    expect(rowLabels()).toEqual(["Open image imani, 2 variants, modified 2d · 330 b"]);
    const badge = tiles()[0]!.querySelector('[data-variants-badge]')!;
    expect(badge.getAttribute("aria-label")).toBe("2 variants");
    expect(tiles()[0]!.querySelector("img")!.getAttribute("src")).toBe("/p/100");
    expect(tiles()[0]!.querySelector("img")!.getAttribute("loading")).toBe("lazy");
    await click(all<HTMLElement>('button[aria-label^="Open image imani"]')[0]);
    expect(inspectedAsset.value).toMatchObject({ path: "Assets/Images/Portraits/imani.png" });
  });

  it("draws landscape tiles under Backdrops and folder tiles covered by the pictures inside", async () => {
    await mount();
    expect(rowLabels()).toEqual(["Open folder Backdrops, 1 image", "Open folder Portraits, 4 images"]);
    const portraits = tiles()[1]!;
    expect(portraits.querySelector("[data-folder-cover]")!.getAttribute("data-folder-cover")).toBe("1");
    await click(all<HTMLElement>('button[aria-label^="Open folder Backdrops"]')[0]);
    expect(tiles().map((tile) => tile.getAttribute("data-tile"))).toEqual(["landscape"]);
  });

  it("keeps a folder's switch to rows for that folder only, with the chip beside the name", async () => {
    workspace.current = { ...workspace.current, lists: { assetsFolders: { image: "Assets/Images/Portraits" } } };
    await mount();
    expect(layoutButton()!.getAttribute("aria-label")).toBe("Show this folder as rows");
    await click(layoutButton()!);
    expect(window.setListState).toHaveBeenCalledWith({ assetsLayouts: { "Assets/Images/Portraits": "rows" } });
    expect(tiles()).toEqual([]);
    expect(host!.querySelector("[data-variants-chip]")!.textContent).toBe("2 variants");
    expect(layoutButton()!.getAttribute("aria-label")).toBe("Show this folder as tiles");
    await click(all<HTMLElement>("nav[aria-label=\"Folder path\"] button").find((b) => b.getAttribute("aria-label") === "Images"));
    expect(tiles().length).toBe(2);
  });

  it("lists search results as rows and leaves the Audio tab as rows with no layout button", async () => {
    await mount();
    await search("imani");
    expect(tiles()).toEqual([]);
    expect(rowLabels()).toEqual([
      "Open image imani, 2 variants, portraits · modified 2d · 330 b",
      "Open audio imani, audio · modified 2d · 5 b",
    ]);
    await search("");
    await showTab("Audio");
    expect(tiles()).toEqual([]);
    expect(layoutButton()).toBeNull();
    expect(rowLabels()).toEqual(["Open audio imani, modified 2d · 5 b"]);
  });
});

describe("the tile shape of a folder not named for portraits or backdrops", () => {
  const tileShapes = () => all<HTMLElement>('[role="listitem"] [data-tile]').map((tile) => tile.getAttribute("data-tile"));

  const png = (width: number, height: number) => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    new DataView(bytes.buffer).setUint32(16, width);
    new DataView(bytes.buffer).setUint32(20, height);
    return bytes;
  };

  const withPictures = (pictures: Record<string, [number, number, number]>) => {
    setListing(Object.fromEntries(Object.entries(pictures).map(([path, [size]]) => [path, facts(size)])));
    measured.sizes = Object.fromEntries(
      Object.entries(pictures).map(([path, [, width, height]]) => [path, { width, height }]),
    );
    const bySrc = new Map(Object.values(pictures).map(([size, width, height]) => [`/p/${size}`, png(width, height)]));
    vi.stubGlobal("fetch", async (src: string) => {
      const bytes = bySrc.get(src);
      return bytes ? new Response(bytes, { status: 206 }) : new Response("", { status: 404 });
    });
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws the shape most of the folder's pictures share once their sizes are read", async () => {
    withPictures({
      "Assets/Images/Cast/ada.png": [3001, 300, 400],
      "Assets/Images/Cast/kai.png": [3002, 300, 400],
      "Assets/Images/Cast/sky.png": [3003, 640, 400],
    });
    workspace.current = { ...workspace.current, lists: { assetsFolders: { image: "Assets/Images/Cast" } } };
    await mount();
    await settle();
    expect(workspace.assetSizes.value).toMatchObject({
      "/p/3001": { width: 300, height: 400 },
      "/p/3003": { width: 640, height: 400 },
    });
    expect(tileShapes()).toEqual(["portrait", "portrait", "portrait"]);
  });

  it("draws landscape tiles when most pictures are wide, and keeps Portraits portrait whatever its pictures", async () => {
    withPictures({
      "Assets/Images/Places/a.png": [4001, 640, 400],
      "Assets/Images/Places/b.png": [4002, 300, 400],
      "Assets/Images/Portraits/c.png": [4003, 640, 400],
    });
    workspace.current = { ...workspace.current, lists: { assetsFolders: { image: "Assets/Images/Places" } } };
    await mount();
    await settle();
    expect(tileShapes()).toEqual(["landscape", "landscape"]);
    await click(all<HTMLElement>("nav[aria-label=\"Folder path\"] button").find((b) => b.getAttribute("aria-label") === "Images"));
    await click(all<HTMLElement>('button[aria-label^="Open folder Portraits"]')[0]);
    expect(tileShapes()).toEqual(["portrait"]);
  });
});

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
  rename: vi.fn(async (path: string, _name: string) => path),
  remove: vi.fn(async (_paths: readonly string[]) => undefined),
  move: vi.fn(async (_paths: readonly string[], _folder: string): Promise<{ from: string; to: string }[]> => []),
  usedBy: vi.fn(async (_paths: readonly string[]): Promise<unknown[] | null> => []),
  downloadAll: vi.fn(async (_paths: readonly string[]) => undefined),
  measureImages: vi.fn(async (_paths: string[]) => undefined),
  watchFacts: vi.fn((_paths: string[]) => () => {}),
  watchPicture: vi.fn((_path: string, _variant: unknown, _listener: (src: string | null) => void) => () => {}),
}));
const measured = vi.hoisted(() => ({ sizes: {} as Record<string, { width: number; height: number }> }));
const window = vi.hoisted(() => ({
  setListState: vi.fn(),
  navigateTo: vi.fn(),
  openTrash: vi.fn(),
  revealDocument: vi.fn(),
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { assets, window },
}));

const speaker = vi.hoisted(() => ({
  audio: undefined as unknown as EventTarget & { src: string; currentTime: number; duration: number; paused: boolean; log: string[] },
}));
vi.mock("../../src/modules/spark-editor/workspace/editorAudio", async () => {
  const { default: AudioSession } = await import("../../src/modules/spark-editor/workspace/AudioSession");
  const { default: SoundPeaks } = await import("../../src/modules/spark-editor/workspace/SoundPeaks");
  class FakeAudio extends EventTarget {
    src = "";
    currentTime = 0;
    duration = Number.NaN;
    paused = true;
    log: string[] = [];
    async play() {
      this.log.push(`play ${this.src}`);
      await Promise.resolve();
      this.paused = false;
      this.dispatchEvent(new Event("playing"));
    }
    pause() {
      if (!this.paused) {
        this.log.push(`stop ${this.src}`);
        this.paused = true;
        this.dispatchEvent(new Event("pause"));
      }
    }
    load() {}
    removeAttribute(name: string) {
      if (name === "src") this.src = "";
    }
  }
  const audio = new FakeAudio();
  speaker.audio = audio;
  return {
    audioSession: new AudioSession({ audio: () => audio, maxBytes: 1_000_000 }),
    soundPeaks: new SoundPeaks(
      {
        read: async (src) => {
          if (src.includes("bad")) throw new Error("unreadable");
          return new Float32Array([0.5, 1]).buffer;
        },
        decode: async (bytes) => ({ channels: [new Float32Array(bytes)], duration: 5 }),
      },
      { limit: 8, maxBytes: 1_000_000, count: 2 },
    ),
  };
});

(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: selection } = await import("../../src/modules/spark-editor/workspace/assetsSelection");
const { default: Assets } = await import("../../src/modules/spark-editor/components/assets");
const { setAssetFiles } = await import("../../src/modules/spark-editor/utils/assetTypes");
await import("../../src/modules/spark-editor/workspace/editorAudio");
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
  speaker.audio.log = [];
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

  it("opens the inspector on a press and the row menu from its own button", async () => {
    await mount();
    await click(all<HTMLElement>('button[aria-label^="Open image bunny"]')[0]);
    const inspector = document.querySelector('section[aria-label="Asset details"]')!;
    expect(inspector.querySelector("header h2")!.textContent).toBe("bunny");
    expect(inspector.querySelector("[data-zoom-frame] img")!.getAttribute("src")).toBe("/p/600");
    await click(inspector.querySelector<HTMLElement>("[data-inspector-close]")!);
    await openMenu(all<HTMLElement>('button[aria-label="Options for bunny"]')[0]);
    await vi.waitFor(() => expect(menuItems()).toEqual(["Select", "Rename", "Move…", "Delete"]));
    await click(all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.includes("Delete")));
    expect(assets.usedBy).toHaveBeenCalledWith(["Assets/Images/bunny.png"]);
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
    const inspector = document.querySelector('section[aria-label="Asset details"]')!;
    expect(inspector.querySelector("header h2")!.textContent).toBe("imani");
    expect(inspector.querySelector("header small")!.textContent).toBe("Image · PNG · 2 variants");
    expect(inspector.querySelector("[data-zoom-frame] img")!.getAttribute("src")).toBe("/p/100");
    expect(assets.watchFacts.mock.calls.at(-1)![0]).toEqual([
      "Assets/Images/Portraits/imani.png",
      "Assets/Images/Portraits/imani@night.png",
      "Assets/Images/Portraits/imani@night~face.sad.png",
      "Assets/Images/Portraits/imani~face.happy.png",
    ]);
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
    expect(assets.measureImages).toHaveBeenCalledWith([
      "Assets/Images/Cast/ada.png",
      "Assets/Images/Cast/kai.png",
      "Assets/Images/Cast/sky.png",
    ]);
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

  it("measures a picture again when its file changes, and keeps drawing the folder", async () => {
    withPictures({
      "Assets/Images/Cast/ada.png": [5001, 300, 400],
      "Assets/Images/Cast/kai.png": [5002, 640, 400],
    });
    workspace.current = { ...workspace.current, lists: { assetsFolders: { image: "Assets/Images/Cast" } } };
    await mount();
    await settle();
    expect(tileShapes()).toEqual(["landscape", "landscape"]);
    await act(async () => {
      withPictures({
        "Assets/Images/Cast/ada.png": [5001, 300, 400],
        "Assets/Images/Cast/kai.png": [5012, 300, 400],
      });
    });
    await settle();
    await settle();
    expect(workspace.assetSizes.value["/p/5012"]).toEqual({ width: 300, height: 400 });
    expect(tileShapes()).toEqual(["portrait", "portrait"]);
  });
});

describe("renaming from the row menu", () => {
  beforeEach(() => {
    setListing({
      "Assets/Images/Portraits/imani.png": facts(6001),
      "Assets/Images/Portraits/imani@night.png": facts(6002),
      "Assets/Images/Portraits/bunny.png": facts(6003),
    });
    workspace.current = { ...workspace.current, lists: { assetsFolders: { image: "Assets/Images/Portraits" } } };
  });

  const menuOf = async (name: string) => {
    await openMenu(all<HTMLElement>(`button[aria-label="Options for ${name}"]`)[0]);
    await vi.waitFor(() => expect(menuItems()).toContain("Delete"));
    const items = menuItems();
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    return items;
  };

  it("offers the same actions for a single file and a stacked picture", async () => {
    await mount();
    expect(await menuOf("bunny")).toEqual(["Select", "Rename", "Move…", "Delete"]);
    expect(await menuOf("imani")).toEqual(["Select", "Rename", "Move…", "Delete"]);
  });

  it("renames a stacked picture from its tile, holding the name as the script writes it", async () => {
    await mount();
    await openMenu(all<HTMLElement>('button[aria-label="Options for imani"]')[0]);
    await vi.waitFor(() => expect(menuItems()).toContain("Rename"));
    await click(all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.includes("Rename")));
    const input = host!.querySelector<HTMLInputElement>('input[aria-label="Rename imani"]')!;
    expect(input.value).toBe("imani");
    await act(async () => {
      input.value = "zadie";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle();
    expect(assets.rename).toHaveBeenCalledWith("Assets/Images/Portraits/imani.png", "zadie");
  });

  it("starts the field of a picture with only an alternate at the name the script writes", async () => {
    setListing({ "Assets/Images/Portraits/imani@night.png": facts(6004) });
    await mount();
    await openMenu(all<HTMLElement>('button[aria-label="Options for imani"]')[0]);
    await vi.waitFor(() => expect(menuItems()).toContain("Rename"));
    await click(all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.includes("Rename")));
    expect(host!.querySelector<HTMLInputElement>('input[aria-label="Rename imani"]')!.value).toBe("imani");
  });

  it("shows a refused single-file rename's whole message under the field in its tile", async () => {
    const message = "That name is already in use in this folder.";
    assets.rename.mockRejectedValueOnce(new Error(message));
    await mount();
    await openMenu(all<HTMLElement>('button[aria-label="Options for bunny"]')[0]);
    await vi.waitFor(() => expect(menuItems()).toContain("Rename"));
    await click(all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.includes("Rename")));
    const input = host!.querySelector<HTMLInputElement>('input[aria-label="Rename bunny"]')!;
    expect(input.value).toBe("bunny");
    await act(async () => {
      input.value = "imani";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle();
    expect(assets.rename).toHaveBeenCalledWith("Assets/Images/Portraits/bunny.png", "imani");
    const alert = host!.querySelector<HTMLElement>('[role="alert"]')!;
    expect(alert.textContent).toBe(message);
    expect(alert.closest("small")!.className).toContain("whitespace-normal");
    expect(alert.closest("small")!.className).not.toContain("fade-edge");
  });
});

describe("selecting, moving and deleting", () => {
  const P = "Assets/Images/Portraits";
  const bar = () => host!.querySelector<HTMLElement>('[role="status"]')?.textContent;
  const barButton = (label: string) =>
    all<HTMLButtonElement>("button").find((button) => button.textContent?.trim() === label);
  const mark = (name: string) => host!.querySelector<HTMLInputElement>(`input[aria-label="Select ${name}"]`)!;
  const check = async (name: string) => {
    await act(async () => mark(name).click());
    await settle();
  };
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

  beforeEach(() => {
    selection.end();
    setListing(
      {
        [`${P}/imani.png`]: facts(7001),
        [`${P}/imani@night.png`]: facts(7002),
        [`${P}/bunny.png`]: facts(7003),
      },
      [`${P}/Cast`],
    );
    workspace.current = { ...workspace.current, lists: { assetsFolders: { image: P } } };
  });

  it("enters selection from a tile's mark, counts, selects all and stops on Escape", async () => {
    await mount();
    expect(mark("imani").closest("[data-tile]")).not.toBeNull();
    await check("imani");
    expect(bar()).toBe("1 selected");
    expect(mark("imani").checked).toBe(true);
    await click(barButton("Select all"));
    expect(bar()).toBe("3 selected");
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(bar()).toBeUndefined();
  });

  it("enters selection from the row menu's Select, and a press then toggles instead of opening", async () => {
    await mount();
    await openMenu(all<HTMLElement>('button[aria-label="Options for bunny"]')[0]);
    await vi.waitFor(() => expect(menuItems()).toContain("Select"));
    await click(all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.includes("Select")));
    expect(bar()).toBe("1 selected");
    await click(all<HTMLElement>('button[aria-label^="Open image imani"]')[0]);
    expect(bar()).toBe("2 selected");
    expect(document.querySelector('section[aria-label="Asset details"]')).toBeNull();
  });

  it("moves the selection through the Move dialog, and downloads it", async () => {
    await mount();
    await check("imani");
    await check("bunny");
    await click(barButton("Download"));
    expect(assets.downloadAll).toHaveBeenCalledWith([`${P}/bunny.png`, `${P}/imani.png`]);
    await click(barButton("Move…"));
    expect(dialog()!.querySelector("h2")!.textContent).toBe("Move 2 items");
    await click([...dialog()!.querySelectorAll<HTMLElement>('[role="option"]')].find((el) => el.textContent?.includes("Cast")));
    await click([...dialog()!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Move here"));
    expect(assets.move).toHaveBeenCalledWith([`${P}/bunny.png`, `${P}/imani.png`], `${P}/Cast`);
    expect(bar()).toBeUndefined();
  });

  it("deletes an unused selection at once, and asks first with its lines when a script uses it", async () => {
    await mount();
    await check("bunny");
    await click(barButton("Delete…"));
    expect(assets.remove).toHaveBeenCalledWith([`${P}/bunny.png`]);
    expect(dialog()).toBeNull();
    const use = (line: number, text: string) => ({
      uri: "file:///p/main.sd",
      range: { start: { line, character: 18 }, end: { line, character: 23 } },
      lineText: text,
      declaration: false,
    });
    assets.usedBy.mockResolvedValueOnce([
      {
        uri: "file:///p/main.sd",
        uses: [
          use(1, "  [[show portrait imani]]"),
          use(2, "  [[show portrait imani@night]]"),
          use(3, "  [[show portrait imani~face.happy]]"),
          use(4, "  [[show portrait imani]]"),
        ],
      },
    ]);
    assets.remove.mockClear();
    await check("imani");
    await click(barButton("Delete…"));
    expect(dialog()!.querySelector("h2")!.textContent).toBe("Delete imani?");
    expect(dialog()!.textContent).toContain("Used in 4 lines");
    expect(dialog()!.querySelectorAll("[data-delete-uses] li")).toHaveLength(3);
    expect(dialog()!.textContent).toContain("and 1 more line");
    expect(assets.remove).not.toHaveBeenCalled();
    await click([...dialog()!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Delete"));
    expect(assets.remove).toHaveBeenCalledWith([`${P}/imani.png`]);
  });

  it("asks first when it could not check the uses", async () => {
    assets.usedBy.mockResolvedValueOnce(null);
    await mount();
    await check("bunny");
    await click(barButton("Delete…"));
    expect(dialog()!.textContent).toContain("Couldn't check which scripts use it.");
    expect(assets.remove).not.toHaveBeenCalled();
  });

  it("drops a dragged tile on a crumb of the trail, and on a folder tile", async () => {
    workspace.current = { ...workspace.current, lists: { assetsFolders: { image: `${P}/Cast` } } };
    setListing(
      { [`${P}/Cast/ada.png`]: facts(7101), [`${P}/imani.png`]: facts(7001) },
      [`${P}/Cast`, `${P}/Cast/Extras`],
    );
    await mount();
    const drag = async (source: HTMLElement, target: HTMLElement) => {
      const dataTransfer = { setData: () => {}, effectAllowed: "", dropEffect: "" };
      await act(async () => {
        source.dispatchEvent(Object.assign(new Event("dragstart", { bubbles: true }), { dataTransfer }));
        target.dispatchEvent(Object.assign(new Event("dragover", { bubbles: true, cancelable: true }), { dataTransfer }));
        target.dispatchEvent(Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer }));
      });
      await settle();
    };
    const ada = host!.querySelector<HTMLElement>('button[aria-label^="Open image ada"]')!;
    const crumb = [...host!.querySelectorAll<HTMLElement>('nav[aria-label="Folder path"] [data-drop-folder]')].find(
      (el) => el.textContent === "Portraits",
    )!;
    expect(crumb.getAttribute("data-drop-folder")).toBe(P);
    await drag(ada, crumb);
    expect(assets.move).toHaveBeenLastCalledWith([`${P}/Cast/ada.png`], P);
    const extras = host!.querySelector<HTMLElement>(`[data-drop-folder="${P}/Cast/Extras"]`)!;
    await drag(host!.querySelector<HTMLElement>('button[aria-label^="Open image ada"]')!, extras);
    expect(assets.move).toHaveBeenLastCalledWith([`${P}/Cast/ada.png`], `${P}/Cast/Extras`);
  });
});

describe("playing sounds from their rows", () => {
  const playButton = (name: string) => host!.querySelector<HTMLElement>(`[data-asset-play][aria-label$=" ${name}"]`)!;
  const rowOf = (name: string) => playButton(name).closest<HTMLElement>('[role="listitem"]')!;
  const inspector = () => document.querySelector<HTMLElement>('section[aria-label="Asset details"]');
  const openSounds = async () => {
    await mount();
    await showTab("Audio");
    await click(all<HTMLElement>('button[aria-label^="Open folder Sounds"]')[0]);
  };
  const tell = async (type: string, change?: () => void) => {
    await act(async () => {
      change?.();
      speaker.audio.dispatchEvent(new Event(type));
    });
    await settle();
  };

  it("puts a Play button in place of each sound's glyph, outside the button that opens it", async () => {
    await openSounds();
    const buttons = all<HTMLElement>("[data-asset-play]");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Play door_chime", "Play footsteps"]);
    for (const button of buttons) {
      expect(button.closest('button[aria-label^="Open"]')).toBeNull();
      expect(button.closest('[role="listitem"]')!.querySelector('button[aria-label^="Open"] svg')).toBeNull();
    }
  });

  it("plays one sound at a time, turning Play to Stop, with the elapsed time in the row's line, and never opens the inspector", async () => {
    await openSounds();
    await click(playButton("door_chime"));
    expect(inspector()).toBeNull();
    expect(playButton("door_chime").getAttribute("aria-label")).toBe("Stop door_chime");
    await tell("loadedmetadata", () => (speaker.audio.duration = 5));
    await tell("timeupdate", () => (speaker.audio.currentTime = 2.4));
    expect(rowOf("door_chime").querySelector("[data-asset-sound-time]")!.textContent).toBe("0:02 / 0:05");
    await click(playButton("footsteps"));
    expect(playButton("door_chime").getAttribute("aria-label")).toBe("Play door_chime");
    expect(playButton("footsteps").getAttribute("aria-label")).toBe("Stop footsteps");
    expect(rowOf("door_chime").querySelector("[data-asset-sound-time]")).toBeNull();
    expect(rowOf("door_chime").textContent).toContain("Modified 2d");
    await click(playButton("footsteps"));
    expect(playButton("footsteps").getAttribute("aria-label")).toBe("Play footsteps");
    expect(speaker.audio.log).toEqual(["play /p/512", "stop /p/512", "play /p/768", "stop /p/768"]);
  });

  it("goes on playing when its own row opens the inspector, and stops when another file is opened", async () => {
    await openSounds();
    await click(playButton("door_chime"));
    await click(rowOf("door_chime").querySelector<HTMLElement>('button[aria-label^="Open audio door_chime"]')!);
    expect(inspector()!.querySelector("[data-audio-player]")!.getAttribute("data-state")).toBe("playing");
    expect(playButton("door_chime").getAttribute("aria-label")).toBe("Stop door_chime");
    await click(inspector()!.querySelector<HTMLElement>('[data-inspector-step="next"]')!);
    expect(playButton("door_chime").getAttribute("aria-label")).toBe("Play door_chime");
    expect(speaker.audio.log.at(-1)).toBe("stop /p/512");
  });

  it("stops when the playing file is renamed, deleted or replaced, and when the page is left", async () => {
    await openSounds();
    await click(playButton("door_chime"));
    const { "Assets/Audio/Sounds/door_chime.wav": playing, ...rest } = workspace.assetListing.value!.files;
    await act(async () => setListing({ ...rest, "Assets/Audio/Sounds/bell.wav": playing! }));
    await settle();
    expect(speaker.audio.log.at(-1)).toBe("stop /p/512");
    await click(playButton("footsteps"));
    const files = workspace.assetListing.value!.files;
    await act(async () =>
      setListing({ ...files, "Assets/Audio/Sounds/footsteps.wav": { ...files["Assets/Audio/Sounds/footsteps.wav"]!, src: "/p/replaced" } }),
    );
    await settle();
    expect(speaker.audio.log.at(-1)).toBe("stop /p/768");
    await click(playButton("footsteps"));
    const { "Assets/Audio/Sounds/footsteps.wav": deleted, ...kept } = workspace.assetListing.value!.files;
    expect(deleted).toBeDefined();
    await act(async () => setListing(kept));
    await settle();
    expect(speaker.audio.log.at(-1)).toBe("stop /p/replaced");
    await click(playButton("bell"));
    await act(async () => render(null, host!));
    expect(speaker.audio.log).toEqual([
      "play /p/512",
      "stop /p/512",
      "play /p/768",
      "stop /p/768",
      "play /p/replaced",
      "stop /p/replaced",
      "play /p/512",
      "stop /p/512",
    ]);
  });

  it("plays a sound whose waveform cannot be read like any other, on a plain track, before, during and after playing", async () => {
    setListing({ ...workspace.assetListing.value!.files, "Assets/Audio/Sounds/door_chime.wav": { ...facts(512), src: "/p/bad" } });
    await openSounds();
    await click(rowOf("door_chime").querySelector<HTMLElement>('button[aria-label^="Open audio door_chime"]')!);
    const player = () => inspector()!.querySelector("[data-audio-player]")!;
    const toggle = () => player().querySelector<HTMLElement>("[data-audio-toggle]");
    expect(player().getAttribute("data-state")).toBe("ready");
    expect(player().querySelector("[data-audio-wave]")!.getAttribute("data-wave")).toBe("plain");
    expect(rowOf("door_chime").querySelector("[data-asset-sound-failed]")).toBeNull();
    await click(toggle()!);
    await tell("timeupdate", () => (speaker.audio.currentTime = 1.2));
    expect(player().getAttribute("data-state")).toBe("playing");
    expect(toggle()!.getAttribute("aria-label")).toBe("Stop door_chime");
    expect(rowOf("door_chime").querySelector("[data-asset-sound-time]")!.textContent).toBe("0:01");
    await click(toggle()!);
    expect(player().getAttribute("data-state")).toBe("ready");
    expect(toggle()!.getAttribute("aria-label")).toBe("Play door_chime");
    expect(player().querySelector('[role="slider"]')).not.toBeNull();
    expect(rowOf("door_chime").querySelector("[data-asset-sound-failed]")).toBeNull();
    await click(toggle()!);
    expect(speaker.audio.log).toEqual(["play /p/bad", "stop /p/bad", "play /p/bad"]);
  });

  it("keeps a row's sound playing through unrelated file changes while another file is open", async () => {
    await openSounds();
    await click(rowOf("door_chime").querySelector<HTMLElement>('button[aria-label^="Open audio door_chime"]')!);
    await click(playButton("footsteps"));
    expect(playButton("footsteps").getAttribute("aria-label")).toBe("Stop footsteps");
    await act(async () => setListing({ ...workspace.assetListing.value!.files, "Assets/Other/new.csv": facts(7) }));
    await settle();
    expect(playButton("footsteps").getAttribute("aria-label")).toBe("Stop footsteps");
    expect(speaker.audio.log).toEqual(["play /p/768"]);
  });

  it("says a file over the size limit is too large to play here, before anything is loaded", async () => {
    setListing({ ...workspace.assetListing.value!.files, "Assets/Audio/Sounds/door_chime.wav": facts(2_000_000) });
    await openSounds();
    await click(rowOf("door_chime").querySelector<HTMLElement>('button[aria-label^="Open audio door_chime"]')!);
    expect(inspector()!.querySelector('[data-audio-player] [role="status"]')!.textContent).toBe("This file is too large to play here.");
    expect(rowOf("door_chime").querySelector("[data-asset-sound-failed]")!.textContent).toBe("This file is too large to play here.");
    await click(playButton("door_chime"));
    expect(speaker.audio.log).toEqual([]);
  });

  it("says a file it cannot play can't be played here, in the row and in the inspector, which still downloads it", async () => {
    setListing({ ...workspace.assetListing.value!.files, "Assets/Audio/Sounds/door_chime.wav": { ...facts(512), src: "/p/bad" } });
    await openSounds();
    await click(playButton("door_chime"));
    await tell("error");
    expect(rowOf("door_chime").querySelector("[data-asset-sound-failed]")!.textContent).toBe("Can't play this file here.");
    await click(rowOf("door_chime").querySelector<HTMLElement>('button[aria-label^="Open audio door_chime"]')!);
    expect(inspector()!.querySelector('[data-audio-player] [role="status"]')!.textContent).toBe("Can't play this file here.");
    expect(inspector()!.querySelector('[data-audio-player] [role="slider"]')).toBeNull();
    await click(inspector()!.querySelector<HTMLElement>("[data-inspector-download]")!);
    expect(assets.downloadAll).toHaveBeenCalledWith(["Assets/Audio/Sounds/door_chime.wav"]);
  });

  for (const width of ["desktop", "phone"] as const) {
    it(`stops a playing sound on Escape and keeps the inspector open, then closes it on the next Escape, at ${width} width`, async () => {
      layout.value = width;
      await openSounds();
      await click(all<HTMLElement>('button[aria-label^="Open audio door_chime"]')[0]);
      const slider = () => inspector()!.querySelector<HTMLElement>('[role="slider"]')!;
      await click(inspector()!.querySelector<HTMLElement>("[data-audio-toggle]")!);
      expect(inspector()!.querySelector("[data-audio-player]")!.getAttribute("data-state")).toBe("playing");
      slider().focus();
      await act(async () => {
        slider().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });
      await settle();
      expect(inspector()).not.toBeNull();
      expect(inspector()!.querySelector("[data-audio-player]")!.getAttribute("data-state")).toBe("ready");
      expect(speaker.audio.log.at(-1)).toBe("stop /p/512");
      await act(async () => {
        slider().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
      expect(inspector()?.querySelector("[data-audio-player]") ?? null).toBeNull();
    });
  }
});

describe("adding files dragged in from the desktop", () => {
  const P = "Assets/Images/Portraits";
  const desktopFiles = (...names: string[]) => ({
    types: ["Files"],
    files: names.map((name) => new File(["xy"], name)),
    items: names.map(() => ({ kind: "file", type: "" })),
    dropEffect: "",
  });
  const dragFiles = async (target: Element, type: "dragover" | "drop", dataTransfer: ReturnType<typeof desktopFiles>) => {
    await act(async () => {
      target.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer }));
    });
    await settle();
  };
  const note = () => host!.querySelector<HTMLElement>('[data-drop-zone="pane"]')?.textContent ?? null;

  beforeEach(() => {
    selection.end();
    workspace.uploads.value = [];
    workspace.assetsReveal.value = null;
    setListing({ [`${P}/imani.png`]: facts(7001) }, [`${P}/Cast`]);
    workspace.current = { ...workspace.current, lists: { assetsFolders: { image: P } } };
  });

  it("frames the page with a note naming the folder in view, and adds the drop there", async () => {
    await mount();
    const list = host!.querySelector<HTMLElement>('button[aria-label^="Open image imani"]')!;
    const files = desktopFiles("rain.ogg", "ada.png");
    await dragFiles(list, "dragover", files);
    expect(note()).toBe("Drop to add to Portraits");
    expect(host!.querySelector("[data-file-drop-target]")).not.toBeNull();
    await dragFiles(list, "drop", files);
    expect(note()).toBeNull();
    await vi.waitFor(() =>
      expect(assets.upload).toHaveBeenCalledWith(
        [expect.objectContaining({ name: "rain.ogg", size: 2 }), expect.objectContaining({ name: "ada.png", size: 2 })],
        P,
      ),
    );
  });

  it("takes a drop on a folder tile into that folder, highlighting it while files are over it", async () => {
    await mount();
    const cast = host!.querySelector<HTMLElement>(`[data-drop-folder="${P}/Cast"]`)!;
    const files = desktopFiles("ada.png");
    await dragFiles(cast, "dragover", files);
    expect(note()).toBe("Drop to add to Portraits/Cast");
    expect(host!.querySelector<HTMLElement>(`[data-drop-folder="${P}/Cast"]`)!.closest("[data-drop-target]")).not.toBeNull();
    await dragFiles(cast, "drop", files);
    await vi.waitFor(() => expect(assets.upload).toHaveBeenCalledWith([expect.objectContaining({ name: "ada.png" })], `${P}/Cast`));
  });

  it("opens on the files a drop elsewhere in the app added, clearing a saved search", async () => {
    workspace.current = { ...workspace.current, lists: { assetsFolders: { image: P }, assetsQueries: { all: "old" } } };
    await mount();
    expect(host!.querySelector<HTMLInputElement>('input[aria-label="Search assets"]')!.value).toBe("old");
    setListing({ [`${P}/imani.png`]: facts(7001), "Assets/Audio/rain.ogg": facts(300) }, [`${P}/Cast`]);
    await act(async () => {
      workspace.assetsReveal.value = ["Assets/Audio/rain.ogg"];
    });
    await settle();
    expect(workspace.assetsReveal.value).toBeNull();
    expect(host!.querySelector<HTMLInputElement>('input[aria-label="Search assets"]')!.value).toBe("");
    expect(workspace.current.lists?.assetsType).toBe("audio");
    expect(rowLabels()).toContain("Open audio rain, modified 2d · 300 b");
  });

  it("shows the upload panel at the page's foot with each file's note, until closed", async () => {
    await mount();
    workspace.uploads.value = [
      { id: 1, name: "ada.png", state: "added", path: `${P}/ada.png` },
      { id: 2, name: "rain.ogg", state: "added", path: "Assets/Audio/rain.ogg" },
      { id: 3, name: "big.mp4", state: "failed", reason: { kind: "storage" } },
    ];
    await settle();
    const panel = host!.querySelector<HTMLElement>('section[aria-label="Uploads"]')!;
    expect(panel.querySelector('[role="status"]')!.textContent).toBe("2 files added, 1 not added");
    expect([...panel.querySelectorAll("li small")].map((el) => el.textContent)).toEqual([
      "Added to Portraits",
      "Added to Audio",
      "Not added: this browser ran out of room for it, so free some space and try again.",
    ]);
    await click(panel.querySelector<HTMLElement>('button[aria-label="Close uploads"]')!);
    expect(host!.querySelector('section[aria-label="Uploads"]')).toBeNull();
  });
});

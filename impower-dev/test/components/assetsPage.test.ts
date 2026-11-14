import { Fragment, h, render } from "preact";
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
  watchPicture: vi.fn((_path: string, _variant: unknown, _size: number, _listener: (src: string | null) => void) => () => {}),
  requestDuration: vi.fn((_path: string) => () => {}),
  measureDurations: vi.fn(async (_paths: readonly string[]) => undefined),
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
  audio: undefined as unknown as EventTarget & { src: string; currentTime: number; duration: number; paused: boolean; loop: boolean; log: string[] },
  reads: [] as string[],
  probes: [] as string[],
  lengths: {} as Record<string, number>,
}));
vi.mock("../../src/modules/spark-editor/workspace/editorAudio", async () => {
  const { default: AudioSession } = await import("../../src/modules/spark-editor/workspace/AudioSession");
  const { default: SoundPeaks } = await import("../../src/modules/spark-editor/workspace/SoundPeaks");
  class FakeAudio extends EventTarget {
    src = "";
    currentTime = 0;
    duration = Number.NaN;
    paused = true;
    loop = false;
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
          speaker.reads.push(src);
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
const { InspectorDockProvider, InspectorDock } = await import("../../src/modules/spark-editor/components/asset-inspector/dock");
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

const showAs = async (layout: "Tiles" | "List") => {
  await openMenu(host!.querySelector<HTMLElement>('[data-assets-action="layout"]')!);
  await vi.waitFor(() => expect(menuItems()).toContain(layout));
  await click(all<HTMLElement>('[role="menuitemradio"]').find((el) => el.textContent?.trim() === layout));
};

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
  speaker.reads = [];
  speaker.probes = [];
  speaker.lengths = {};
  workspace.assetDurations.value = {};
  assets.requestDuration.mockImplementation((path: string) => {
    const src = workspace.assetListing.value!.files[path]?.src;
    if (src && !Object.hasOwn(workspace.assetDurations.value, src)) {
      speaker.probes.push(src);
      workspace.assetDurations.value = { ...workspace.assetDurations.value, [src]: speaker.lengths[src] ?? null };
    }
    return () => {};
  });
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
    it(`shows the six type tabs and an Add button at ${width} width`, async () => {
      layout.value = width;
      await mount();
      expect(tabs().map((tab) => tab.id.replace(/^.*-trigger-/, ""))).toEqual(["image", "audio", "video", "text", "font", "other"]);
      expect(tabs().every((tab, i) => tab.textContent!.startsWith(["Images", "Audio", "Video", "Text", "Fonts", "Other"][i]!))).toBe(true);
      expect(tabs()[0]!.getAttribute("aria-selected")).toBe("true");
      expect(host!.querySelector('[data-assets-action="add"]')?.textContent).toBe("Add");
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
    expect(text()).toContain("Add sounds and music with the Add button.");
    expect(text()).not.toContain("New button");
    await showTab("Video");
    expect(text()).toContain("Add a video with the Add button.");
    await showTab("Text");
    expect(text()).toContain("Add notes with the Add button.");
    await showTab("Fonts");
    expect(text()).toContain("Add a font with the Add button.");
    await showTab("Other");
    expect(text()).toContain("Files of any other type land here when you add them.");
    await showTab("Images");
    await click(all<HTMLElement>('button[aria-label^="Open folder Empty"]')[0]);
    expect(text()).toContain("This folder is empty");
    expect(text()).toContain("Add files to it with the Add button, or drop files on it from its parent folder.");
    await act(async () => {
      setListing({});
    });
    await settle();
    expect(text()).toContain("A collection of your art");
    expect(text()).toContain("Your portraits, backgrounds, sounds and music will appear here.");
    expect(all<HTMLButtonElement>("button").some((b) => b.textContent?.includes("Add files from this device"))).toBe(true);
    await act(async () => {
      setListing({ "Assets/Audio/theme.ogg": facts() });
    });
    await settle();
    await showTab("Images");
    expect(text()).toContain("No images yet");
    expect(text()).toContain("Add portraits and backgrounds with the Add button.");
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

  it("offers Name, Modified, Size, Uses and Story order, and keeps the choice per project", async () => {
    await mount();
    await openMenu(all<HTMLElement>('button[aria-label^="Sort by"]')[0]);
    await vi.waitFor(() =>
      expect(menuItems()).toEqual([
        "Name",
        "Modified",
        "Size",
        "UsesLines in the scripts that show or play it.",
        "Story order",
        "A to Z",
        "Z to A",
      ]),
    );
    await click(all<HTMLElement>('[role="menuitemradio"]').find((el) => el.textContent?.includes("Size")));
    expect(window.setListState).toHaveBeenCalledWith({ assetsSort: "size-desc" });
  });

  it("offers uploads, a link by address and a new folder from Add", async () => {
    await mount();
    await openMenu(host!.querySelector<HTMLElement>('[data-assets-action="add"]')!);
    await vi.waitFor(() =>
      expect(menuItems()).toEqual(["Add files from this device", "Add a linkA file hosted on the web", "New folder"]),
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

  it("follows an upload that lands in another type's folder to that tab, opening the folder it landed in", async () => {
    workspace.current = { ...workspace.current, lists: { assetsType: "font" } };
    assets.upload.mockImplementationOnce(async () => {
      setListing({ ...workspace.assetListing.value!.files, "Assets/Images/Portraits/bunny2.png": facts(700) });
      return ["Assets/Images/Portraits/bunny2.png"];
    });
    await mount();
    await chooseFiles("bunny2.png");
    expect(selectedTab()).toBe("image");
    expect(workspace.current.lists?.assetsFolders).toMatchObject({ image: "Assets/Images" });
  });

  it("follows a link to the tab of the type its address names", async () => {
    assets.addLink.mockImplementationOnce(async () => {
      setListing({ ...workspace.assetListing.value!.files, "Assets/Audio/horn.url": { ...facts(40), address: "https://cdn.example.com/horn.mp3" } });
      return "Assets/Audio/horn.url";
    });
    await mount();
    await openMenu(host!.querySelector<HTMLElement>('[data-assets-action="add"]')!);
    await vi.waitFor(() => expect(menuItems()).toContain("Add a linkA file hosted on the web"));
    await click(all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.includes("Add a link")));
    const [url, name] = all<HTMLInputElement>('[role="dialog"] input');
    await act(async () => {
      url!.value = "https://cdn.example.com/horn.mp3";
      url!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(all<HTMLButtonElement>('[role="dialog"] button').find((b) => b.textContent?.trim() === "Add link"));
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
    expect(rowLabels()).toEqual(["Open image imani, 4 variants, modified 2d · 330 b"]);
    expect(host!.querySelector('[aria-label="Assets and folders"]')!.parentElement!.className.split(" ")).toContain("pt-4");
    const badge = tiles()[0]!.querySelector('[data-variants-badge]')!;
    expect(badge.getAttribute("aria-label")).toBe("4 variants");
    expect(tiles()[0]!.querySelector("img")!.getAttribute("src")).toBe("/p/100");
    expect(tiles()[0]!.querySelector("img")!.getAttribute("loading")).toBe("lazy");
    await click(all<HTMLElement>('button[aria-label^="Open image imani"]')[0]);
    const inspector = document.querySelector('section[aria-label="Asset details"]')!;
    expect(inspector.querySelector("header h2")!.textContent).toBe("imani");
    expect(inspector.querySelector("header small")!.textContent).toBe("Image · PNG · 4 variants");
    expect(inspector.querySelector("[data-zoom-frame] img")!.getAttribute("src")).toBe("/p/100");
    expect(assets.watchFacts.mock.calls.at(-1)![0]).toEqual([
      "Assets/Images/Portraits/imani.png",
      "Assets/Images/Portraits/imani@night.png",
      "Assets/Images/Portraits/imani@night~face.sad.png",
      "Assets/Images/Portraits/imani~face.happy.png",
    ]);
  });

  it("fits a portrait tile's picture to the tile's height, centred", async () => {
    const classes = (tile: HTMLElement) => tile.querySelector("img")!.className.split(" ");
    workspace.current = { ...workspace.current, lists: { assetsFolders: { image: "Assets/Images/Portraits" } } };
    await mount();
    const portrait = classes(tiles()[0]!);
    expect(portrait).toEqual(expect.arrayContaining(["h-full", "w-auto", "max-w-none", "left-1/2", "-translate-x-1/2"]));
    expect(portrait).not.toContain("object-cover");
    expect(portrait).not.toContain("size-full");
  });

  it("draws landscape tiles under Backdrops and folder tiles covered by the pictures inside", async () => {
    await mount();
    expect(rowLabels()).toEqual(["Open folder Backdrops, 1 image", "Open folder Portraits, 4 images"]);
    const portraits = tiles()[1]!;
    expect(portraits.querySelector("[data-folder-cover]")!.getAttribute("data-folder-cover")).toBe("1");
    await click(all<HTMLElement>('button[aria-label^="Open folder Backdrops"]')[0]);
    expect(tiles().map((tile) => tile.getAttribute("data-tile"))).toEqual(["landscape"]);
    expect(tiles()[0]!.querySelector("img")!.className.split(" ")).toEqual(expect.arrayContaining(["size-full", "object-cover"]));
  });

  it("offers the folder's layouts from a menu showing the current one's icon, and keeps a choice for that folder only, with the chip beside the name", async () => {
    workspace.current = { ...workspace.current, lists: { assetsFolders: { image: "Assets/Images/Portraits" } } };
    await mount();
    expect(layoutButton()!.getAttribute("aria-label")).toBe("Change how this folder is shown");
    expect(layoutButton()!.getAttribute("aria-haspopup")).toBe("menu");
    expect(layoutButton()!.getAttribute("data-layout")).toBe("tiles");
    await openMenu(layoutButton()!);
    await vi.waitFor(() => expect(menuItems()).toEqual(["Tiles", "List"]));
    expect(all<HTMLElement>('[role="menuitemradio"]').map((el) => el.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    const itemIcon = (label: string) =>
      all<HTMLElement>('[role="menuitemradio"]').find((el) => el.textContent?.trim() === label)!.querySelector("svg:not([data-radio-indicator])")!.innerHTML;
    const tilesIcon = itemIcon("Tiles");
    const listIcon = itemIcon("List");
    expect(tilesIcon).not.toBe(listIcon);
    const triggerIcon = () => layoutButton()!.querySelector("svg")!.innerHTML;
    expect(triggerIcon()).toBe(tilesIcon);
    await click(all<HTMLElement>('[role="menuitemradio"]').find((el) => el.textContent?.trim() === "List"));
    expect(window.setListState).toHaveBeenCalledWith({ assetsLayouts: { "Assets/Images/Portraits": "rows" } });
    expect(tiles()).toEqual([]);
    expect(host!.querySelector("[data-variants-chip]")!.textContent).toBe("4 variants");
    expect(layoutButton()!.getAttribute("data-layout")).toBe("rows");
    expect(triggerIcon()).toBe(listIcon);
    await openMenu(layoutButton()!);
    await vi.waitFor(() =>
      expect(all<HTMLElement>('[role="menuitemradio"]').map((el) => el.getAttribute("aria-checked"))).toEqual(["false", "true"]),
    );
    await click(all<HTMLElement>('[role="menuitemradio"]').find((el) => el.textContent?.trim() === "List"));
    await click(all<HTMLElement>("nav[aria-label=\"Folder path\"] button").find((b) => b.getAttribute("aria-label") === "Images"));
    expect(tiles().length).toBe(2);
  });

  it("lists search results as rows and leaves the Audio tab as rows with no layout button", async () => {
    await mount();
    await search("imani");
    expect(tiles()).toEqual([]);
    expect(rowLabels()).toEqual([
      "Open image imani, 4 variants, portraits · modified 2d · 330 b",
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

  it("plays one sound at a time, turning Play to Pause, with the elapsed time in the row's line, and never opens the inspector", async () => {
    await openSounds();
    await click(playButton("door_chime"));
    expect(inspector()).toBeNull();
    expect(playButton("door_chime").getAttribute("aria-label")).toBe("Pause door_chime");
    await tell("loadedmetadata", () => (speaker.audio.duration = 5));
    await tell("timeupdate", () => (speaker.audio.currentTime = 2.4));
    expect(rowOf("door_chime").querySelector("[data-asset-sound-time]")!.textContent).toBe("0:02 / 0:05");
    await click(playButton("footsteps"));
    expect(playButton("door_chime").getAttribute("aria-label")).toBe("Play door_chime");
    expect(playButton("footsteps").getAttribute("aria-label")).toBe("Pause footsteps");
    expect(rowOf("door_chime").querySelector("[data-asset-sound-time]")).toBeNull();
    expect(rowOf("door_chime").textContent).toContain("Modified 2d");
    await click(playButton("footsteps"));
    expect(playButton("footsteps").getAttribute("aria-label")).toBe("Play footsteps");
    expect(speaker.audio.log).toEqual(["play /p/512", "stop /p/512", "play /p/768", "stop /p/768"]);
  });

  it("leads a row's line with the sound's length floored to whole seconds, read once for the rows shown, and keeps it beside the elapsed time while playing", async () => {
    setListing({
      "Assets/Audio/Sounds/bell.wav": facts(5121),
      "Assets/Audio/Sounds/creak.wav": facts(5122),
      ...Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`Assets/Audio/Sounds/zz_${String(i).padStart(3, "0")}.wav`, facts(6000 + i)])),
    });
    speaker.lengths = { "/p/5121": 5.6 };
    await openSounds();
    const line = (name: string) => rowOf(name).querySelector("[data-asset-sound-line]")!.textContent;
    await vi.waitFor(() => expect(line("bell")).toMatch(/^0:05 · Modified 2d · 5 kB$/));
    expect(line("creak")).toMatch(/^Modified 2d · 5 kB$/);
    expect(speaker.probes).toContain("/p/5121");
    expect(speaker.reads).toEqual([]);
    await act(async () => {
      workspace.assetListing.value = { ...workspace.assetListing.value!, files: { ...workspace.assetListing.value!.files } };
    });
    await settle();
    expect(speaker.probes.length).toBeLessThan(60);
    expect(new Set(speaker.probes).size).toBe(speaker.probes.length);
    await click(playButton("bell"));
    await tell("loadedmetadata", () => (speaker.audio.duration = 5.6));
    await tell("timeupdate", () => (speaker.audio.currentTime = 2.4));
    expect(line("bell")).toMatch(/^0:02 \/ 0:05 · Modified 2d · 5 kB$/);
    expect(rowOf("bell").querySelector("[data-asset-sound-time]")!.textContent).toBe("0:02 / 0:05");
    await click(playButton("bell"));
  });

  it("pauses a row's sound in place, holding its time in the row and in the inspector, and resumes it there", async () => {
    await openSounds();
    await click(playButton("door_chime"));
    await tell("loadedmetadata", () => (speaker.audio.duration = 5));
    await tell("timeupdate", () => (speaker.audio.currentTime = 3.2));
    await click(playButton("door_chime"));
    expect(playButton("door_chime").getAttribute("aria-label")).toBe("Play door_chime");
    expect(rowOf("door_chime").querySelector("[data-asset-sound-time]")!.textContent).toBe("0:03 / 0:05");
    expect(speaker.audio.src).toBe("/p/512");
    await click(rowOf("door_chime").querySelector<HTMLElement>('button[aria-label^="Open audio door_chime"]')!);
    const player = () => inspector()!.querySelector<HTMLElement>("[data-audio-player]")!;
    expect(player().getAttribute("data-state")).toBe("paused");
    expect(player().querySelector("[data-audio-elapsed]")!.textContent).toBe("0:03");
    expect(player().querySelector("[data-audio-toggle]")!.getAttribute("aria-label")).toBe("Play door_chime");
    await click(player().querySelector<HTMLElement>("[data-audio-toggle]")!);
    expect(player().getAttribute("data-state")).toBe("playing");
    expect(playButton("door_chime").getAttribute("aria-label")).toBe("Pause door_chime");
    expect(speaker.audio.currentTime).toBe(3.2);
    await click(playButton("door_chime"));
    expect(player().getAttribute("data-state")).toBe("paused");
    expect(speaker.audio.log).toEqual(["play /p/512", "stop /p/512", "play /p/512", "stop /p/512"]);
  });

  it("restarts the inspected sound at 0:00 whether it is playing or paused, keeping it so", async () => {
    await openSounds();
    await click(rowOf("door_chime").querySelector<HTMLElement>('button[aria-label^="Open audio door_chime"]')!);
    const player = () => inspector()!.querySelector<HTMLElement>("[data-audio-player]")!;
    const restart = () => player().querySelector<HTMLElement>("[data-audio-restart]")!;
    expect(restart().getAttribute("aria-label")).toBe("Restart");
    await click(player().querySelector<HTMLElement>("[data-audio-toggle]")!);
    await tell("loadedmetadata", () => (speaker.audio.duration = 5));
    await tell("timeupdate", () => (speaker.audio.currentTime = 2.6));
    await click(restart());
    expect(speaker.audio.currentTime).toBe(0);
    expect(player().getAttribute("data-state")).toBe("playing");
    expect(player().querySelector("[data-audio-elapsed]")!.textContent).toBe("0:00");
    await tell("timeupdate", () => (speaker.audio.currentTime = 4.1));
    await click(player().querySelector<HTMLElement>("[data-audio-toggle]")!);
    await click(restart());
    expect(player().getAttribute("data-state")).toBe("paused");
    expect(player().querySelector("[data-audio-elapsed]")!.textContent).toBe("0:00");
    expect(speaker.audio.log).toEqual(["play /p/512", "stop /p/512"]);
  });

  it("starts Loop on for a sound in the Music folder, and the toggle sets the element's loop for that sound only", async () => {
    await mount();
    await showTab("Audio");
    await click(all<HTMLElement>('button[aria-label^="Open folder Music"]')[0]);
    await click(all<HTMLElement>('button[aria-label^="Open audio harbor_theme"]')[0]);
    const loop = () => inspector()!.querySelector<HTMLElement>("[data-audio-loop]")!;
    expect(loop().getAttribute("aria-label")).toBe("Loop");
    expect(loop().getAttribute("aria-pressed")).toBe("true");
    await click(inspector()!.querySelector<HTMLElement>("[data-audio-toggle]")!);
    expect(speaker.audio.loop).toBe(true);
    await click(loop());
    expect(loop().getAttribute("aria-pressed")).toBe("false");
    expect(speaker.audio.loop).toBe(false);
    await click(inspector()!.querySelector<HTMLElement>('[data-inspector-step="next"]')!);
    expect(loop().getAttribute("aria-pressed")).toBe("true");
    await click(inspector()!.querySelector<HTMLElement>('[data-inspector-step="previous"]')!);
    expect(loop().getAttribute("aria-pressed")).toBe("false");
    await click(loop());
    expect(loop().getAttribute("aria-pressed")).toBe("true");
  });

  it("starts Loop off for a sound in the Sounds folder", async () => {
    await openSounds();
    await click(rowOf("door_chime").querySelector<HTMLElement>('button[aria-label^="Open audio door_chime"]')!);
    const loop = () => inspector()!.querySelector<HTMLElement>("[data-audio-loop]")!;
    expect(loop().getAttribute("aria-pressed")).toBe("false");
    await click(inspector()!.querySelector<HTMLElement>("[data-audio-toggle]")!);
    expect(speaker.audio.loop).toBe(false);
  });

  it("stops the inspected sound when the inspector closes", async () => {
    await openSounds();
    await click(rowOf("door_chime").querySelector<HTMLElement>('button[aria-label^="Open audio door_chime"]')!);
    await click(inspector()!.querySelector<HTMLElement>("[data-audio-toggle]")!);
    await click(inspector()!.querySelector<HTMLElement>("[data-inspector-close]")!);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(playButton("door_chime").getAttribute("aria-label")).toBe("Play door_chime");
    expect(rowOf("door_chime").querySelector("[data-asset-sound-time]")).toBeNull();
    expect(speaker.audio.log).toEqual(["play /p/512", "stop /p/512"]);
    expect(speaker.audio.src).toBe("");
  });

  it("stops a sound started from another row when the inspector closes", async () => {
    await openSounds();
    await click(rowOf("door_chime").querySelector<HTMLElement>('button[aria-label^="Open audio door_chime"]')!);
    await click(playButton("footsteps"));
    expect(playButton("footsteps").getAttribute("aria-label")).toBe("Pause footsteps");
    await click(inspector()!.querySelector<HTMLElement>("[data-inspector-close]")!);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(playButton("footsteps").getAttribute("aria-label")).toBe("Play footsteps");
    expect(speaker.audio.log).toEqual(["play /p/768", "stop /p/768"]);
    expect(speaker.audio.src).toBe("");
  });

  it("shows a sound cued in the inspector before it ever plays at the same time in its row", async () => {
    await openSounds();
    await click(rowOf("door_chime").querySelector<HTMLElement>('button[aria-label^="Open audio door_chime"]')!);
    const slider = inspector()!.querySelector<HTMLElement>('[data-audio-player] [role="slider"]')!;
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
    });
    await settle();
    expect(inspector()!.querySelector("[data-audio-player]")!.getAttribute("data-state")).toBe("ready");
    expect(inspector()!.querySelector("[data-audio-elapsed]")!.textContent).toBe("0:05");
    expect(rowOf("door_chime").querySelector("[data-asset-sound-time]")!.textContent).toBe("0:05 / 0:05");
    expect(playButton("door_chime").getAttribute("aria-label")).toBe("Play door_chime");
    expect(speaker.audio.log).toEqual([]);
  });

  it("goes on playing when its own row opens the inspector, and stops when another file is opened", async () => {
    await openSounds();
    await click(playButton("door_chime"));
    await click(rowOf("door_chime").querySelector<HTMLElement>('button[aria-label^="Open audio door_chime"]')!);
    expect(inspector()!.querySelector("[data-audio-player]")!.getAttribute("data-state")).toBe("playing");
    expect(playButton("door_chime").getAttribute("aria-label")).toBe("Pause door_chime");
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
    expect(toggle()!.getAttribute("aria-label")).toBe("Pause door_chime");
    expect(rowOf("door_chime").querySelector("[data-asset-sound-time]")!.textContent).toBe("0:01");
    await click(toggle()!);
    expect(player().getAttribute("data-state")).toBe("paused");
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
    expect(playButton("footsteps").getAttribute("aria-label")).toBe("Pause footsteps");
    await act(async () => setListing({ ...workspace.assetListing.value!.files, "Assets/Other/new.csv": facts(7) }));
    await settle();
    expect(playButton("footsteps").getAttribute("aria-label")).toBe("Pause footsteps");
    expect(speaker.audio.log).toEqual(["play /p/768"]);
  });

  it("says a file over the size limit is too large to play here, and loads nothing of it", async () => {
    const loaded: string[] = [];
    vi.stubGlobal("Audio", function () {
      const audio = document.createElement("audio");
      Object.defineProperty(audio, "src", {
        configurable: true,
        get: () => "",
        set: (source: string) => loaded.push(source),
      });
      return audio;
    });
    try {
      setListing({ ...workspace.assetListing.value!.files, "Assets/Audio/Sounds/door_chime.wav": facts(2_000_000) });
      await openSounds();
      await click(rowOf("footsteps").querySelector<HTMLElement>('button[aria-label^="Open audio footsteps"]')!);
      expect(assets.measureDurations).toHaveBeenCalledWith(["Assets/Audio/Sounds/footsteps.wav"]);
      await click(rowOf("door_chime").querySelector<HTMLElement>('button[aria-label^="Open audio door_chime"]')!);
      expect(inspector()!.querySelector('[data-audio-player] [role="status"]')!.textContent).toBe("This file is too large to play here.");
      expect(rowOf("door_chime").querySelector("[data-asset-sound-failed]")!.textContent).toBe("This file is too large to play here.");
      await click(playButton("door_chime"));
      expect(speaker.audio.log).toEqual([]);
      expect(assets.measureDurations).not.toHaveBeenCalledWith(["Assets/Audio/Sounds/door_chime.wav"]);
      expect(loaded).toEqual([]);
      expect(speaker.reads).not.toContain("/p/2000000");
      expect(speaker.probes).not.toContain("/p/2000000");
      expect(assets.requestDuration).not.toHaveBeenCalledWith("Assets/Audio/Sounds/door_chime.wav");
    } finally {
      vi.unstubAllGlobals();
    }
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

describe("the rows and the inspector show one session's state", () => {
  type Expect = {
    sounding: string | null;
    held: string | null;
    at?: string;
    failed?: string;
    cued?: boolean;
    inspector?: false;
  };
  type Step = [action: string, expect: Expect];

  const SOUNDS = ["door_chime", "footsteps"];
  const MUSIC = ["harbor_theme", "night_market"];
  const SRC: Record<string, string> = {
    door_chime: "/p/512",
    footsteps: "/p/768",
    harbor_theme: "/p/4096",
    night_market: "/p/2048",
  };
  const PATH: Record<string, string> = {
    door_chime: "Assets/Audio/Sounds/door_chime.wav",
    footsteps: "Assets/Audio/Sounds/footsteps.wav",
  };

  const playButton = (name: string) => host?.querySelector<HTMLElement>(`[data-asset-play][aria-label$=" ${name}"]`) ?? null;
  const rowOf = (name: string) => playButton(name)?.closest<HTMLElement>('[role="listitem"]') ?? null;
  const inspector = () => document.querySelector<HTMLElement>('section[aria-label="Asset details"]');
  const player = () => inspector()?.querySelector<HTMLElement>("[data-audio-player]") ?? null;
  const tell = async (type: string, change?: () => void) => {
    await act(async () => {
      change?.();
      speaker.audio.dispatchEvent(new Event(type));
    });
    await settle();
  };
  const closeInspector = async () => {
    await click(inspector()!.querySelector<HTMLElement>("[data-inspector-close]")!);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
  };

  const act_: Record<string, (name: string) => Promise<void>> = {
    play: async (name) => click(playButton(name)!),
    open: async (name) => click(rowOf(name)!.querySelector<HTMLElement>(`button[aria-label^="Open audio ${name}"]`)!),
    toggle: async () => click(player()!.querySelector<HTMLElement>("[data-audio-toggle]")!),
    restart: async () => click(player()!.querySelector<HTMLElement>("[data-audio-restart]")!),
    loop: async () => click(player()!.querySelector<HTMLElement>("[data-audio-loop]")!),
    cue: async () => {
      const slider = player()!.querySelector<HTMLElement>('[role="slider"]')!;
      await act(async () => {
        slider.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
      });
      await settle();
      await tell("loadedmetadata", () => (speaker.audio.duration = 5));
    },
    next: async () => click(inspector()!.querySelector<HTMLElement>('[data-inspector-step="next"]')!),
    close: closeInspector,
    time: async (seconds) => tell("timeupdate", () => (speaker.audio.currentTime = Number(seconds))),
    end: async () => {
      if (speaker.audio.loop) {
        await tell("timeupdate", () => (speaker.audio.currentTime = 0));
        return;
      }
      await act(async () => {
        speaker.audio.currentTime = 5;
        speaker.audio.paused = true;
        speaker.audio.dispatchEvent(new Event("pause"));
        speaker.audio.dispatchEvent(new Event("ended"));
      });
      await settle();
    },
    outside: async () => {
      await act(async () => (speaker.audio as unknown as { pause(): void }).pause());
      await settle();
    },
    error: async () => tell("error"),
    delete: async (name) => {
      const { [PATH[name]!]: gone, ...kept } = workspace.assetListing.value!.files;
      expect(gone).toBeDefined();
      await act(async () => setListing(kept));
      await settle();
    },
    leave: async () => {
      await act(async () => render(null, host!));
    },
  };

  const rowTime = (name: string) => rowOf(name)?.querySelector("[data-asset-sound-time]")?.textContent ?? null;

  const agree = (names: readonly string[], want: Expect, step: string) => {
    const where = (detail: string) => `after "${step}": ${detail}`;
    for (const name of names) {
      if (!playButton(name)) continue;
      const label = playButton(name)!.getAttribute("aria-label");
      expect(label, where(`${name}'s row button`)).toBe(`${want.sounding === name ? "Pause" : "Play"} ${name}`);
      const failedLine = rowOf(name)!.querySelector("[data-asset-sound-failed]");
      expect(!!failedLine, where(`${name}'s row failure line`)).toBe(want.failed === name);
      const time = rowTime(name);
      expect(time !== null, where(`${name}'s row time`)).toBe(want.held === name && want.failed !== name);
      if (time !== null && want.at) {
        expect(time.split(" / ")[0], where(`${name}'s row time`)).toBe(want.at);
      }
    }
    const shown = player();
    if (shown) {
      const inspected = (shown.closest("[data-sound-frame]")!.getAttribute("aria-label") ?? "").replace(/ player$/, "");
      expect(names, where("the inspected sound")).toContain(inspected);
      const state = shown.getAttribute("data-state");
      if (want.failed === inspected) {
        expect(state, where("inspector state")).toBe("failed");
      } else {
        const toggle = shown.querySelector("[data-audio-toggle]")!.getAttribute("aria-label");
        expect(toggle, where("inspector toggle")).toBe(`${want.sounding === inspected ? "Pause" : "Play"} ${inspected}`);
        const held = want.held === inspected;
        expect(state, where("inspector state")).toBe(
          want.sounding === inspected ? "playing" : held && !want.cued ? "paused" : "ready",
        );
        const elapsed = shown.querySelector("[data-audio-elapsed]")!.textContent;
        if (held) {
          if (playButton(inspected)) {
            expect(elapsed, where("inspector and row time")).toBe(rowTime(inspected)!.split(" / ")[0]);
          }
          if (want.at) {
            expect(elapsed, where("inspector time")).toBe(want.at);
          }
        } else {
          expect(elapsed, where("inspector time of a sound the session does not hold")).toBe("0:00");
        }
      }
    }
    if (want.inspector === false) {
      expect(inspector(), where("the inspector")).toBeNull();
    }
    const loaded = speaker.audio.src;
    if (want.failed) {
      return;
    }
    expect(loaded, where("the element's source")).toBe(want.held ? SRC[want.held] : "");
    expect(speaker.audio.paused, where("the element paused")).toBe(want.sounding === null);
    if (!want.held) {
      return;
    }
    const whole = Math.floor(speaker.audio.currentTime);
    const playhead = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
    const shownTime = rowTime(want.held)?.split(" / ")[0] ?? shown?.querySelector("[data-audio-elapsed]")?.textContent;
    expect(shownTime, where("the element's time against the time shown")).toBe(playhead);
    const loop = shown?.querySelector("[data-audio-loop]");
    if (loop && shown!.closest("[data-sound-frame]")!.getAttribute("aria-label") === `${want.held} player`) {
      expect(loop.getAttribute("aria-pressed"), where("Loop against the element's loop")).toBe(String(speaker.audio.loop));
    }
  };

  const none: Expect = { sounding: null, held: null };
  const playing = (name: string, at?: string): Expect => ({ sounding: name, held: name, at });
  const paused = (name: string, at?: string): Expect => ({ sounding: null, held: name, at });
  const cued = (name: string, at?: string): Expect => ({ sounding: null, held: name, at, cued: true });

  const TABLE: { title: string; folder: "Sounds" | "Music"; steps: Step[] }[] = [
    {
      title: "a row starts, pauses and resumes, and the inspector opened on it shows the same",
      folder: "Sounds",
      steps: [
        ["play door_chime", playing("door_chime")],
        ["time 3.2", playing("door_chime", "0:03")],
        ["play door_chime", paused("door_chime", "0:03")],
        ["open door_chime", paused("door_chime", "0:03")],
        ["toggle", playing("door_chime", "0:03")],
        ["time 4.1", playing("door_chime", "0:04")],
        ["play door_chime", paused("door_chime", "0:04")],
        ["toggle", playing("door_chime", "0:04")],
        ["toggle", paused("door_chime", "0:04")],
      ],
    },
    {
      title: "starting another row stops the first and forgets its place, from a row or under the inspector",
      folder: "Sounds",
      steps: [
        ["open door_chime", none],
        ["toggle", playing("door_chime")],
        ["time 2.2", playing("door_chime", "0:02")],
        ["play footsteps", playing("footsteps", "0:00")],
        ["toggle", playing("door_chime", "0:00")],
        ["toggle", paused("door_chime", "0:00")],
        ["play footsteps", playing("footsteps", "0:00")],
        ["play footsteps", paused("footsteps", "0:00")],
        ["play door_chime", playing("door_chime", "0:00")],
      ],
    },
    {
      title: "a cue before the first Play, a Restart in each state, and a scrub while paused",
      folder: "Sounds",
      steps: [
        ["open door_chime", none],
        ["cue", cued("door_chime", "0:05")],
        ["restart", cued("door_chime", "0:00")],
        ["play door_chime", playing("door_chime", "0:00")],
        ["time 3.6", playing("door_chime", "0:03")],
        ["restart", playing("door_chime", "0:00")],
        ["time 2.5", playing("door_chime", "0:02")],
        ["toggle", paused("door_chime", "0:02")],
        ["cue", paused("door_chime", "0:05")],
        ["restart", paused("door_chime", "0:00")],
      ],
    },
    {
      title: "a sound ends and lets go without Loop, and wraps with it",
      folder: "Sounds",
      steps: [
        ["open door_chime", none],
        ["toggle", playing("door_chime")],
        ["time 4.9", playing("door_chime", "0:04")],
        ["end", none],
        ["loop", none],
        ["toggle", playing("door_chime")],
        ["time 4.9", playing("door_chime", "0:04")],
        ["end", playing("door_chime", "0:00")],
        ["loop", playing("door_chime", "0:00")],
        ["end", none],
      ],
    },
    {
      title: "a Music sound loops by default from its row and from the inspector",
      folder: "Music",
      steps: [
        ["play harbor_theme", playing("harbor_theme")],
        ["end", playing("harbor_theme", "0:00")],
        ["open harbor_theme", playing("harbor_theme", "0:00")],
        ["toggle", paused("harbor_theme", "0:00")],
        ["toggle", playing("harbor_theme", "0:00")],
        ["end", playing("harbor_theme", "0:00")],
      ],
    },
    {
      title: "selecting another asset stops the sound, playing or paused, unless it is that asset's own",
      folder: "Sounds",
      steps: [
        ["open door_chime", none],
        ["toggle", playing("door_chime")],
        ["next", none],
        ["toggle", playing("footsteps")],
        ["toggle", paused("footsteps")],
        ["open door_chime", none],
        ["play footsteps", playing("footsteps")],
        ["open footsteps", playing("footsteps")],
      ],
    },
    {
      title: "closing the inspector stops the sound, whoever started it and whether it plays or is paused",
      folder: "Sounds",
      steps: [
        ["open door_chime", none],
        ["toggle", playing("door_chime")],
        ["close", none],
        ["open door_chime", none],
        ["toggle", playing("door_chime")],
        ["toggle", paused("door_chime")],
        ["close", none],
        ["open door_chime", none],
        ["play footsteps", playing("footsteps")],
        ["play footsteps", paused("footsteps")],
        ["close", none],
        ["play footsteps", playing("footsteps")],
      ],
    },
    {
      title: "a pause from outside the editor holds the place in both views",
      folder: "Sounds",
      steps: [
        ["open door_chime", none],
        ["toggle", playing("door_chime")],
        ["time 1.5", playing("door_chime", "0:01")],
        ["outside door_chime", paused("door_chime", "0:01")],
        ["toggle", playing("door_chime", "0:01")],
      ],
    },
    {
      title: "a file that fails, playing or paused, says so in both views and the next press tries again",
      folder: "Sounds",
      steps: [
        ["open door_chime", none],
        ["toggle", playing("door_chime")],
        ["error", { sounding: null, held: null, failed: "door_chime" }],
        ["play door_chime", playing("door_chime")],
        ["play door_chime", paused("door_chime")],
        ["error", { sounding: null, held: null, failed: "door_chime" }],
      ],
    },
    {
      title: "deleting the file playing or paused stops it, and closes an inspector open on it",
      folder: "Sounds",
      steps: [
        ["open door_chime", none],
        ["toggle", playing("door_chime")],
        ["time 2.6", playing("door_chime", "0:02")],
        ["delete door_chime", { ...none, inspector: false }],
        ["open footsteps", none],
        ["toggle", playing("footsteps")],
        ["time 1.3", playing("footsteps", "0:01")],
        ["toggle", paused("footsteps", "0:01")],
        ["delete footsteps", { ...none, inspector: false }],
      ],
    },
    {
      title: "deleting a row's file stops it while the inspector shows another",
      folder: "Sounds",
      steps: [
        ["open door_chime", none],
        ["play footsteps", playing("footsteps")],
        ["play footsteps", paused("footsteps")],
        ["delete footsteps", none],
      ],
    },
    {
      title: "leaving the page stops a paused sound",
      folder: "Sounds",
      steps: [
        ["open door_chime", none],
        ["toggle", playing("door_chime")],
        ["toggle", paused("door_chime")],
        ["leave", none],
      ],
    },
  ];

  for (const { title, folder, steps } of TABLE) {
    it(title, async () => {
      await mount();
      await showTab("Audio");
      await click(all<HTMLElement>(`button[aria-label^="Open folder ${folder}"]`)[0]);
      const names = folder === "Music" ? MUSIC : SOUNDS;
      agree(names, none, "the start");
      for (const [action, want] of steps) {
        const [verb, argument = ""] = action.split(" ");
        await act_[verb]!(argument);
        agree(names, want, action);
      }
    });
  }
});

describe("adding files dragged in from the desktop", () => {
  const P = "Assets/Images/Portraits";
  const desktopFiles = (...names: string[]) => {
    const files = names.map((name) => new File(["xy"], name));
    return {
      types: ["Files"],
      files,
      items: files.map((file) => ({ kind: "file", type: "", getAsFile: () => file })),
      dropEffect: "",
    };
  };
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

  it("shows the added-files panel at the page's foot with each file's note, until closed", async () => {
    await mount();
    workspace.uploads.value = [
      { id: 1, name: "ada.png", state: "added", path: `${P}/ada.png` },
      { id: 2, name: "rain.ogg", state: "added", path: "Assets/Audio/rain.ogg" },
      { id: 3, name: "big.mp4", state: "failed", reason: { kind: "storage" } },
    ];
    await settle();
    const panel = host!.querySelector<HTMLElement>('section[aria-label="Added files"]')!;
    expect(panel.querySelector('[role="status"]')!.textContent).toBe("2 files added, 1 not added");
    expect([...panel.querySelectorAll("li small")].map((el) => el.textContent)).toEqual([
      "Added to Portraits",
      "Added to Audio",
      "Not added: this browser ran out of room for it, so free some space and try again.",
    ]);
    await click(panel.querySelector<HTMLElement>('button[aria-label="Close added files"]')!);
    expect(host!.querySelector('section[aria-label="Added files"]')).toBeNull();
  });
});

describe("sorting by Uses and Story order", () => {
  const P = "Assets/Images";
  const shown = (path: string, line: number) => ({
    uri: `file:///p/${path}`,
    path,
    range: { start: { line, character: 2 }, end: { line, character: 8 } },
    role: "backdrop" as const,
    text: "  [[show backdrop x]]",
  });
  const counted = () => {
    workspace.assetUsage.value = {
      projectId: PROJECT,
      version: 1,
      uses: {
        [`${P}/harbor.png`]: [shown("main.sd", 1), shown("Scripts/market.sd", 4)],
        [`${P}/harbor@night.png`]: [shown("Scripts/market.sd", 9)],
        [`${P}/market.png`]: [shown("Scripts/market.sd", 2)],
      },
      order: ["main.sd", "Scripts/market.sd"],
    };
  };
  const sortMenuNote = () => document.querySelector("[data-sort-note]")?.textContent ?? null;

  beforeEach(() => {
    workspace.current = { ...workspace.current, lists: { assetsSort: "uses-asc" } };
    setListing({
      [`${P}/harbor.png`]: facts(1024),
      [`${P}/harbor@night.png`]: facts(1024),
      [`${P}/market.png`]: facts(2048),
      [`${P}/unused.png`]: facts(512),
    });
  });

  afterEach(() => {
    workspace.assetUsage.value = null;
  });

  it("sorts as Name with the modified line and a note in the menu until uses are counted", async () => {
    workspace.assetUsage.value = null;
    await mount();
    await showAs("List");
    expect(rowLabels()).toEqual([
      "Open image harbor, 2 variants, modified 2d · 2 kb",
      "Open image market, modified 2d · 2 kb",
      "Open image unused, modified 2d · 512 b",
    ]);
    await openMenu(all<HTMLElement>('button[aria-label^="Sort by"]')[0]);
    await vi.waitFor(() => expect(sortMenuNote()).toBe("Counting uses…"));
  });

  it("says the uses could not be counted, and sorts by name with the modified line, when the count failed", async () => {
    workspace.assetUsage.value = null;
    workspace.assetUsageFailed.value = PROJECT;
    await mount();
    await showAs("List");
    expect(rowLabels()[0]).toBe("Open image harbor, 2 variants, modified 2d · 2 kb");
    await openMenu(all<HTMLElement>('button[aria-label^="Sort by"]')[0]);
    await vi.waitFor(() => expect(sortMenuNote()).toBe("Uses could not be counted. Edit a script to try again."));
    workspace.assetUsageFailed.value = null;
  });

  it("lists every unused thing first under Uses ascending, and moves one out without a reload", async () => {
    counted();
    await mount();
    await showAs("List");
    expect(rowLabels()).toEqual([
      "Open image unused, unused",
      "Open image market, 1 use",
      "Open image harbor, 2 variants, 3 uses",
    ]);
    await act(async () => {
      workspace.assetUsage.value = {
        ...workspace.assetUsage.value!,
        version: 2,
        uses: { ...workspace.assetUsage.value!.uses, [`${P}/unused.png`]: [shown("main.sd", 5), shown("main.sd", 6)] },
      };
    });
    await settle();
    expect(rowLabels()).toEqual([
      "Open image market, 1 use",
      "Open image unused, 2 uses",
      "Open image harbor, 2 variants, 3 uses",
    ]);
    await openMenu(all<HTMLElement>('button[aria-label^="Sort by"]')[0]);
    await vi.waitFor(() => expect(menuItems()).toContain("Least used first"));
    expect(sortMenuNote()).toBeNull();
  });

  it("orders by the first line that reaches each thing in Story order, unreached last", async () => {
    workspace.current = { ...workspace.current, lists: { assetsSort: "story-asc" } };
    counted();
    await mount();
    await showAs("List");
    expect(rowLabels().map((label) => label!.split(",")[0])).toEqual([
      "Open image harbor",
      "Open image market",
      "Open image unused",
    ]);
  });

  it("asks the delete check with the row's paths, so it agrees with the row", async () => {
    counted();
    await mount();
    await showAs("List");
    await openMenu(all<HTMLElement>('button[aria-label="Options for harbor"]')[0]);
    await click(all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.includes("Delete")));
    expect(assets.usedBy).toHaveBeenCalledWith([`${P}/harbor.png`]);
  });
});

describe("the inspector of an asset that moves", () => {
  const P = "Assets/Images/Portraits";
  const S = "Assets/Audio";
  const inspector = () => document.querySelector<HTMLElement>('section[aria-label="Asset details"]');
  const title = () => inspector()?.querySelector("header h2")?.textContent;
  const dialog = () => document.querySelector<HTMLElement>('[role="listbox"][aria-label="Folders"]')?.closest<HTMLElement>('[role="dialog"]');
  const leaf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
  const folderOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
  const stem = (path: string) => leaf(path).replace(/\.[^.]*$/, "");
  const at = (path: string, size: number) => ({ ...facts(size), src: `/src/${path}` });
  const belongs = (path: string, cover: string) =>
    folderOf(path) === folderOf(cover) &&
    (path === cover || (leaf(path).startsWith(stem(cover)) && /^[@~]/.test(leaf(path).slice(stem(cover).length))));
  const moveFiles = (moves: readonly { from: string; to: string }[]) => {
    const { files, folders } = workspace.assetListing.value!;
    const next = { ...files };
    for (const { from, to } of moves) {
      next[to] = { ...next[from]!, src: `/src/${to}` };
      delete next[from];
    }
    workspace.assetListing.value = { projectId: PROJECT, files: next, folders };
  };
  const press = async (label: string) => click(all<HTMLElement>(`button[aria-label^="${label}"]`)[0]);
  const chooseMove = async (trigger: HTMLElement | undefined) => {
    await openMenu(trigger);
    await click(all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.includes("Move")));
  };
  const moveHere = async (folder: string) => {
    await click([...dialog()!.querySelectorAll<HTMLElement>('[role="option"]')].find((el) => el.textContent?.includes(folder)));
    await click([...dialog()!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Move here"));
  };
  const listMenu = (name: string) =>
    all<HTMLElement>(`button[aria-label="Options for ${name}"]`).find((button) => !inspector()?.contains(button));
  const headMenu = (name: string) => inspector()?.querySelector<HTMLElement>(`button[aria-label="Options for ${name}"]`) ?? undefined;
  const frameSrc = () => inspector()?.querySelector("[data-zoom-frame] img")?.getAttribute("src");
  const watchedFiles = () => assets.watchFacts.mock.calls.at(-1)![0];

  beforeEach(() => {
    selection.end();
    workspace.assetListing.value = {
      projectId: PROJECT,
      files: {
        [`${P}/ava.png`]: at(`${P}/ava.png`, 8001),
        [`${P}/ava@night.png`]: at(`${P}/ava@night.png`, 8002),
        [`${P}/ava~face.happy.png`]: at(`${P}/ava~face.happy.png`, 8003),
        [`${P}/bo.png`]: at(`${P}/bo.png`, 8004),
        [`${P}/Cast/dex.png`]: at(`${P}/Cast/dex.png`, 8005),
        [`${S}/Sounds/chime.wav`]: at(`${S}/Sounds/chime.wav`, 8006),
        [`${S}/Music/theme.wav`]: at(`${S}/Music/theme.wav`, 8007),
      },
      folders: [`${P}/Cast`],
    };
    workspace.current = { ...workspace.current, lists: { assetsFolders: { image: P, audio: `${S}/Sounds` } } };
    assets.move.mockImplementation(async (paths: readonly string[], folder: string) => {
      const files = Object.keys(workspace.assetListing.value!.files);
      const moves = files
        .filter((path) => paths.some((cover) => belongs(path, cover)))
        .map((from) => ({ from, to: `${folder}/${leaf(from)}` }));
      moveFiles(moves);
      return moves;
    });
  });

  afterEach(() => {
    assets.move.mockImplementation(async () => []);
    workspace.movesReplayed.value = null;
  });

  const expectStackAtCast = () => {
    expect(title()).toBe("ava");
    expect(inspector()!.querySelector("header small")!.textContent).toBe("Image · PNG · 3 variants");
    expect(frameSrc()).toBe(`/src/${P}/Cast/ava.png`);
    expect(watchedFiles()).toEqual([`${P}/Cast/ava.png`, `${P}/Cast/ava@night.png`, `${P}/Cast/ava~face.happy.png`]);
    expect(workspace.current.lists?.assetsFolders?.image).toBe(`${P}/Cast`);
    expect(host!.querySelector(`[data-asset-path="${P}/Cast/ava.png"]`)).not.toBeNull();
  };

  it("shows a stacked picture moved from its row menu at its new folder, with every member file, and opens that folder in the list", async () => {
    await mount();
    await press("Open image ava");
    expect(frameSrc()).toBe(`/src/${P}/ava.png`);
    await chooseMove(listMenu("ava"));
    await moveHere("Cast");
    expect(assets.move).toHaveBeenCalledWith([`${P}/ava.png`], `${P}/Cast`);
    expectStackAtCast();
  });

  it("shows a stacked picture moved from the inspector's own menu at its new folder", async () => {
    await mount();
    await press("Open image ava");
    await chooseMove(headMenu("ava"));
    await moveHere("Cast");
    expectStackAtCast();
  });

  it("shows a stacked picture moved from the selection bar at its new folder", async () => {
    await mount();
    await press("Open image ava");
    await act(async () => host!.querySelector<HTMLInputElement>('input[aria-label="Select ava"]')!.click());
    await settle();
    await click(all<HTMLButtonElement>("button").find((button) => button.textContent?.trim() === "Move…"));
    await moveHere("Cast");
    expectStackAtCast();
  });

  it("shows a plain picture moved from its row menu at its new folder", async () => {
    await mount();
    await press("Open image bo");
    await chooseMove(listMenu("bo"));
    await moveHere("Cast");
    expect(title()).toBe("bo");
    expect(frameSrc()).toBe(`/src/${P}/Cast/bo.png`);
    expect(watchedFiles()).toEqual([`${P}/Cast/bo.png`]);
    expect(workspace.current.lists?.assetsFolders?.image).toBe(`${P}/Cast`);
  });

  it("shows a sound moved from the inspector's own menu at its new folder", async () => {
    await mount();
    await showTab("Audio");
    await press("Open audio chime");
    expect(title()).toBe("chime");
    await chooseMove(headMenu("chime"));
    await moveHere("Music");
    expect(title()).toBe("chime");
    expect(watchedFiles()).toEqual([`${S}/Music/chime.wav`]);
    expect(workspace.current.lists?.assetsFolders?.audio).toBe(`${S}/Music`);
  });

  it("follows the stacked picture back to its first folder when Undo puts its files back", async () => {
    await mount();
    await press("Open image ava");
    await chooseMove(listMenu("ava"));
    await moveHere("Cast");
    expectStackAtCast();
    const back = [`ava.png`, `ava@night.png`, `ava~face.happy.png`].map((name) => ({
      from: `${P}/Cast/${name}`,
      to: `${P}/${name}`,
    }));
    const shown = inspector();
    await act(async () => {
      workspace.movesReplayed.value = { moves: back, settled: false };
      moveFiles(back);
    });
    const sheetState = () => inspector()?.closest('[role="dialog"]')?.getAttribute("data-state");
    expect(inspector()).toBe(shown);
    expect(sheetState()).toBe("open");
    expect(title()).toBe("ava");
    await settle();
    expect(inspector()).toBe(shown);
    expect(sheetState()).toBe("open");
    await act(async () => {
      workspace.movesReplayed.value = { moves: back, settled: true };
    });
    await settle();
    expect(inspector()).toBe(shown);
    expect(sheetState()).toBe("open");
    expect(title()).toBe("ava");
    expect(frameSrc()).toBe(`/src/${P}/ava.png`);
    expect(watchedFiles()).toEqual([`${P}/ava.png`, `${P}/ava@night.png`, `${P}/ava~face.happy.png`]);
    expect(workspace.current.lists?.assetsFolders?.image).toBe(P);
  });

  const replay = async (moves: readonly { from: string; to: string }[]) => {
    await act(async () => {
      workspace.movesReplayed.value = { moves, settled: false };
    });
    await act(async () => moveFiles(moves));
    await act(async () => {
      workspace.movesReplayed.value = { moves, settled: true };
    });
    await settle();
  };
  const toCast = [`ava.png`, `ava@night.png`, `ava~face.happy.png`].map((name) => ({
    from: `${P}/${name}`,
    to: `${P}/Cast/${name}`,
  }));
  const searchField = () => host!.querySelector<HTMLInputElement>('input[aria-label="Search assets"]')!;

  it("follows the picture but leaves the list in its folder while the author scrolls it", async () => {
    await mount();
    await press("Open image ava");
    await act(async () => {
      host!.querySelector(`[data-asset-path="${P}/bo.png"]`)!.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 40 }));
    });
    await replay(toCast);
    expect(title()).toBe("ava");
    expect(frameSrc()).toBe(`/src/${P}/Cast/ava.png`);
    expect(workspace.current.lists?.assetsFolders?.image).toBe(P);
  });

  it("follows the picture but leaves the search and its results alone while the author types in it", async () => {
    await mount();
    await press("Open image ava");
    await search("ava");
    await act(async () => searchField().focus());
    await replay(toCast);
    expect(title()).toBe("ava");
    expect(frameSrc()).toBe(`/src/${P}/Cast/ava.png`);
    expect(searchField().value).toBe("ava");
    expect(document.activeElement).toBe(searchField());
    expect(workspace.current.lists?.assetsFolders?.image).toBe(P);
  });

  it("keeps showing the picture at its new folder when the search in the list leaves it out", async () => {
    await mount();
    await press("Open image ava");
    await search("dex");
    await act(async () => searchField().blur());
    await replay(toCast);
    expect(title()).toBe("ava");
    expect(frameSrc()).toBe(`/src/${P}/Cast/ava.png`);
    expect(searchField().value).toBe("dex");
    expect(rowLabels().map((label) => label!.split(",")[0])).toEqual(["Open image dex"]);
  });

  const renameFromInspector = async (name: string, typed: string, key: "Enter" | "Escape") => {
    await openMenu(headMenu(name));
    await click(all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.trim() === "Rename"));
    await vi.waitFor(() => expect(host!.querySelector(`input[aria-label="Rename ${name}"]`)).not.toBeNull());
    const input = host!.querySelector<HTMLInputElement>(`input[aria-label="Rename ${name}"]`)!;
    await act(async () => {
      input.value = typed;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
    await settle();
  };

  const renameToBea = () =>
    assets.rename.mockImplementationOnce(async (path: string, name: string) => {
      const to = `${folderOf(path)}/${name}.png`;
      moveFiles([{ from: path, to }]);
      return to;
    });

  it("shows a picture renamed from the inspector's own menu under its new name in the phone's sheet", async () => {
    layout.value = "phone";
    renameToBea();
    await mount();
    await press("Open image bo");
    await renameFromInspector("bo", "bea", "Enter");
    expect(assets.rename).toHaveBeenCalledWith(`${P}/bo.png`, "bea");
    expect(title()).toBe("bea");
    expect(frameSrc()).toBe(`/src/${P}/bea.png`);
    expect(inspector()!.closest('[role="dialog"]')?.getAttribute("data-state")).toBe("open");
  });

  it("keeps the docked inspector on a picture renamed from its own menu at desktop width", async () => {
    renameToBea();
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(h(InspectorDockProvider, { children: h(Fragment, {}, h(InspectorDock, {}), h(Assets, {})) }), host!),
    );
    await settle();
    await press("Open image bo");
    const shown = inspector();
    expect(shown!.closest('[role="dialog"]')).toBeNull();
    await renameFromInspector("bo", "bea", "Enter");
    expect(inspector()).toBe(shown);
    expect(title()).toBe("bea");
    expect(frameSrc()).toBe(`/src/${P}/bea.png`);
  });

  it("returns to the inspector on the same picture when a rename from its menu is cancelled on a phone", async () => {
    layout.value = "phone";
    await mount();
    await press("Open image bo");
    await renameFromInspector("bo", "bea", "Escape");
    expect(assets.rename).not.toHaveBeenCalled();
    expect(title()).toBe("bo");
    expect(inspector()!.closest('[role="dialog"]')?.getAttribute("data-state")).toBe("open");
  });

  it("closes when the moved picture is deleted", async () => {
    await mount();
    await press("Open image ava");
    await chooseMove(listMenu("ava"));
    await moveHere("Cast");
    const { files, folders } = workspace.assetListing.value!;
    await act(async () => {
      workspace.assetListing.value = {
        projectId: PROJECT,
        files: Object.fromEntries(Object.entries(files).filter(([path]) => !path.includes("/ava"))),
        folders,
      };
    });
    await settle();
    expect(inspector()).toBeNull();
  });
});

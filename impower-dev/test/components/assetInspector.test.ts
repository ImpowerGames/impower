import { Fragment, h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({
  value: "desktop" as "phone" | "compact" | "desktop",
  coarse: false,
}));
vi.mock("@impower/impower-ui/layout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@impower/impower-ui/layout")>()),
  useLayout: () => layout.value,
  useCoarsePointer: () => layout.coarse,
}));

type Listener = (facts: { problems: unknown[] | null }) => void;

const facts = vi.hoisted(() => ({ problems: [] as unknown[] | null, listeners: [] as Listener[] }));
const assets = vi.hoisted(() => ({
  watch: vi.fn(() => () => {}),
  upload: vi.fn(async (): Promise<string[]> => []),
  addLink: vi.fn(async () => ""),
  createFolder: vi.fn(async () => ""),
  rename: vi.fn(async (path: string, _name: string) => path),
  remove: vi.fn(async (_paths: readonly string[]) => undefined),
  move: vi.fn(async (_paths: readonly string[], _folder: string): Promise<{ from: string; to: string }[]> => []),
  usedBy: vi.fn(async (_paths: readonly string[]): Promise<unknown[] | null> => []),
  measureImages: vi.fn(async () => undefined),
  requestDuration: vi.fn((_path: string) => () => {}),
  measureDurations: vi.fn(async (_paths: readonly string[]) => undefined),
  watchFacts: vi.fn((_paths: string[], listener: Listener) => {
    facts.listeners.push(listener);
    listener({ problems: facts.problems });
    return () => {
      facts.listeners = facts.listeners.filter((l) => l !== listener);
    };
  }),
  replace: vi.fn(async (path: string) => path),
  download: vi.fn(async (_path: string) => undefined),
  downloadAll: vi.fn(async (_paths: readonly string[]) => undefined),
  watchPicture: vi.fn((_path: string, _variant: { image: string; attributes: string[] }, _size: number, listener: (src: string | null) => void) => {
    listener(`/picture/${[_variant.image, ..._variant.attributes].join("~")}`);
    return () => {};
  }),
  renameMember: vi.fn(async (path: string, _name: string) => path),
  removeMember: vi.fn(async (_path: string) => undefined),
  addBeside: vi.fn(async (_files: unknown[], _path: string): Promise<string[]> => []),
  readText: vi.fn(async () => "The lamps come on one by one."),
  setAddress: vi.fn(async () => undefined),
}));
const window = vi.hoisted(() => ({
  setListState: vi.fn(),
  navigateTo: vi.fn(),
  revealDocument: vi.fn(async () => undefined),
  insertReference: vi.fn(async (_filename: string, _construct: string, _reference: string) => true),
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
const { InspectorDock, InspectorDockProvider, inspectorHost } = await import(
  "../../src/modules/spark-editor/components/asset-inspector"
);
const { setAssetFiles } = await import("../../src/modules/spark-editor/utils/assetTypes");
const { snackbar } = await import("../../src/modules/spark-editor/utils/snackbar");
const { NameError } = await import("../../src/modules/spark-editor/utils/fileListModel");
const { PROJECT_SETTINGS_SCHEMA } = await import(
  "../../src/modules/spark-editor/workspace/settings/settingsSchema"
);

const PROJECT = "p";
const fact = (size: number) => ({ modified: Date.now() - 2 * 86_400_000, size, src: `/p/${size}` });

let host: HTMLDivElement | undefined;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const page = (withDock: boolean) =>
  withDock
    ? h(InspectorDockProvider, {}, h(Fragment, {}, h("div", { "data-preview-pane": "" }, h(InspectorDock, {})), h(Assets, {})))
    : h(Assets, {});

const mount = async (withDock = true) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(page(withDock), host!));
  await settle();
};

const rerender = async () => {
  await act(async () => {
    workspace.assetListing.value = { ...workspace.assetListing.value!, files: { ...workspace.assetListing.value!.files } };
  });
  await settle();
};

const all = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)];
const region = () => document.querySelector<HTMLElement>('section[aria-label="Asset details"]');
const dock = () => document.querySelector<HTMLElement>("[data-inspector-dock]")!;
const title = () => region()!.querySelector("header h2")!.textContent;
const subtitle = () => region()!.querySelector("header small")!.textContent;
const step = (direction: "previous" | "next") =>
  region()!.querySelector<HTMLButtonElement>(`[data-inspector-step="${direction}"]`)!;
const closeButton = () => region()!.querySelector<HTMLButtonElement>("[data-inspector-close]")!;
const rowLabels = () =>
  all<HTMLElement>('[role="listitem"] button[aria-label^="Open"]').map((b) => b.getAttribute("aria-label")!);
const rowFor = (path: string) => document.querySelector<HTMLElement>(`[data-asset-path="${path}"]`)!;
const details = () =>
  [...region()!.querySelectorAll("dl > dt")].map((dt) => `${dt.textContent}: ${dt.nextElementSibling!.textContent}`);
const sectionTitles = () => [...region()!.querySelectorAll("section h3")].map((el) => el.textContent);

const click = async (el: HTMLElement | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => {
    el!.click();
  });
  await settle();
};

const key = async (target: Element, name: string) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  });
  await settle();
};

const open = async (name: string) => {
  await click(all<HTMLElement>(`button[aria-label^="Open"]`).find((b) => b.getAttribute("aria-label")!.split(",")[0]!.endsWith(` ${name}`)));
};

const search = async (value: string) => {
  const input = host!.querySelector<HTMLInputElement>('input[aria-label="Search assets"]')!;
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
};

const lists = (next: Record<string, unknown>) => {
  workspace.current = { ...workspace.current, lists: { ...workspace.current.lists, ...next } };
};

beforeEach(() => {
  layout.value = "desktop";
  layout.coarse = false;
  workspace.assetUsage.value = { projectId: PROJECT, version: 1, uses: {}, order: ["main.sd"] };
  workspace.assetUsageFailed.value = null;
  facts.problems = [];
  facts.listeners = [];
  for (const fn of [...Object.values(assets), ...Object.values(window)]) fn.mockClear();
  assets.measureDurations.mockImplementation(async () => undefined);
  workspace.assetDurations.value = {};
  window.setListState.mockImplementation((next) => lists(next));
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: PROJECT },
    lists: { assetsType: "audio", assetsFolders: { audio: "Assets/Audio/Sounds" } },
  };
  workspace.assetSizes.value = {};
  setAssetFiles({
    imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
    audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
    videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
    fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
  });
  workspace.assetListing.value = {
    projectId: PROJECT,
    folders: [],
    files: {
      "Assets/Audio/Sounds/bell.wav": fact(2048),
      "Assets/Audio/Sounds/door_chime.wav": fact(512),
      "Assets/Audio/Sounds/footsteps.wav": fact(768),
      "Assets/Images/Backdrops/harbor.png": fact(600),
      "Assets/Images/Backdrops/market.png": fact(700),
      "Assets/Video/intro.webm": fact(4),
      "Assets/Fonts/courier_prime.ttf": fact(2049),
      "Assets/Text/notes.txt": fact(180),
      "Assets/Other/table.csv": fact(19),
    },
  };
  snackbar.value = null;
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
});

describe("the asset inspector", () => {
  it("opens in the preview pane's dock with focus on Close, the name, the type and both neighbours", async () => {
    await mount();
    expect(region()).toBeNull();
    await open("door_chime");
    expect(dock().contains(region())).toBe(true);
    expect(region()!.getAttribute("data-asset-inspector")).toBe("dock");
    expect(document.activeElement).toBe(closeButton());
    expect(closeButton().getAttribute("aria-label")).toBe("Close details");
    expect(title()).toBe("door_chime");
    expect(subtitle()).toBe("Audio · WAV");
    expect(step("previous").getAttribute("aria-label")).toBe("Previous: bell");
    expect(step("next").getAttribute("aria-label")).toBe("Next: footsteps");
    expect(rowFor("Assets/Audio/Sounds/door_chime.wav").getAttribute("aria-current")).toBeTruthy();
  });

  it("steps through the folder in its current sort, and keeps focus on a step button that is still there", async () => {
    await mount();
    expect(rowLabels().map((label) => label.split(",")[0])).toEqual([
      "Open audio bell",
      "Open audio door_chime",
      "Open audio footsteps",
    ]);
    await open("bell");
    expect(step("previous").disabled).toBe(true);
    expect(step("previous").getAttribute("aria-label")).toBe("No previous item");
    step("next").focus();
    await click(step("next"));
    expect(title()).toBe("door_chime");
    expect(document.activeElement).toBe(step("next"));
    await click(step("next"));
    expect(title()).toBe("footsteps");
    expect(step("next").getAttribute("aria-label")).toBe("No next item");
    expect(document.activeElement).toBe(step("previous"));

    await act(async () => lists({ assetsSort: "size-desc" }));
    await rerender();
    expect(rowLabels().map((label) => label.split(",")[0])).toEqual([
      "Open audio bell",
      "Open audio footsteps",
      "Open audio door_chime",
    ]);
    expect(step("previous").getAttribute("aria-label")).toBe("Previous: bell");
    expect(step("next").getAttribute("aria-label")).toBe("Next: door_chime");
  });

  it("steps through search results in the list's own order across types", async () => {
    await mount();
    await search("o");
    const shown = rowLabels().map((label) => label.split(",")[0]!.split(" ").pop());
    expect(shown.length).toBeGreaterThan(4);
    await open(shown[0]!);
    const visited = [title()];
    while (!step("next").disabled) {
      await click(step("next"));
      visited.push(title());
    }
    expect(visited).toEqual(shown);
  });

  it("steps with the Left and Right keys, closes on Escape and returns focus to the item's row", async () => {
    await mount();
    await open("door_chime");
    await key(closeButton(), "ArrowRight");
    expect(title()).toBe("footsteps");
    await key(closeButton(), "ArrowLeft");
    await key(closeButton(), "ArrowLeft");
    expect(title()).toBe("bell");
    await key(closeButton(), "Escape");
    expect(region()).toBeNull();
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    expect(document.activeElement).toBe(rowFor("Assets/Audio/Sounds/bell.wav"));
  });

  it("keeps its scroll position while stepping", async () => {
    await mount();
    await open("door_chime");
    const body = region()!.querySelector<HTMLElement>("[data-inspector-body]")!;
    body.scrollTop = 40;
    await click(step("next"));
    expect(region()!.querySelector("[data-inspector-body]")).toBe(body);
    expect(body.scrollTop).toBe(40);
  });

  it("is a full-screen sheet with Back on phones, and Escape returns to the row", async () => {
    layout.value = "phone";
    await mount();
    await open("door_chime");
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.contains(region())).toBe(true);
    expect(dialog.className).toContain("h-full");
    expect(dock().contains(region())).toBe(false);
    expect(region()!.getAttribute("data-asset-inspector")).toBe("sheet");
    expect(closeButton().getAttribute("aria-label")).toBe("Back to the collection");
    expect(document.activeElement).toBe(closeButton());
    await click(closeButton());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
    await settle();
    expect(region()).toBeNull();
    expect(document.activeElement).toBe(rowFor("Assets/Audio/Sounds/door_chime.wav"));
  });

  it("docks only in the desktop layout with a dock mounted, and is a sheet otherwise, by the one host rule", async () => {
    expect(inspectorHost("desktop", document.createElement("div"))).toBe("dock");
    expect(inspectorHost("compact", document.createElement("div"))).toBe("sheet");
    expect(inspectorHost("compact", null)).toBe("sheet");
    expect(inspectorHost("phone", document.createElement("div"))).toBe("sheet");
    expect(inspectorHost("desktop", null)).toBe("sheet");
    await mount(false);
    await open("door_chime");
    expect(document.querySelector('[role="dialog"]')!.contains(region())).toBe(true);
  });

  it("closes when a layout change moves its host, from desktop to compact and back", async () => {
    await mount();
    await open("door_chime");
    expect(dock().contains(region())).toBe(true);
    layout.value = "compact";
    await rerender();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
    expect(region()).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(rowFor("Assets/Audio/Sounds/door_chime.wav"));

    await open("door_chime");
    expect(document.querySelector('[role="dialog"]')!.contains(region())).toBe(true);
    layout.value = "desktop";
    await rerender();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
    expect(region()).toBeNull();
    expect(dock().childElementCount).toBe(0);
    expect(document.activeElement).toBe(rowFor("Assets/Audio/Sounds/door_chime.wav"));
  });

  it("keeps keyboard focus in the frame when the file on screen changes, so Escape still closes", async () => {
    lists({ assetsType: "image", assetsFolders: { image: "Assets/Images/Backdrops" } });
    await mount();
    await open("harbor");
    const frame = region()!.querySelector<HTMLElement>("[data-zoom-frame][tabindex]")!;
    frame.focus();
    await act(async () => {
      const listing = workspace.assetListing.value!;
      workspace.assetListing.value = {
        ...listing,
        files: {
          ...listing.files,
          "Assets/Images/Backdrops/harbor.png": { ...listing.files["Assets/Images/Backdrops/harbor.png"]!, src: "/p/600?v=2" },
        },
      };
    });
    await settle();
    const fresh = region()!.querySelector<HTMLElement>("[data-zoom-frame][tabindex]")!;
    expect(fresh).not.toBe(frame);
    expect(document.activeElement).toBe(fresh);
    await key(fresh, "Escape");
    expect(region()).toBeNull();
  });

  it("rebuilds a stack kept open under a search that hides it when one of its files goes", async () => {
    workspace.assetListing.value = {
      ...workspace.assetListing.value!,
      files: { ...workspace.assetListing.value!.files, "Assets/Images/Backdrops/harbor@night.png": fact(601) },
    };
    lists({ assetsType: "image", assetsFolders: { image: "Assets/Images/Backdrops" } });
    await mount();
    await open("harbor");
    expect(subtitle()).toBe("Image · PNG · 2 variants");
    expect(details()).toContain("Files: 2 files · 1 kB");
    await search("market");
    expect(title()).toBe("harbor");
    await act(async () => {
      const { "Assets/Images/Backdrops/harbor@night.png": _gone, ...rest } = workspace.assetListing.value!.files;
      workspace.assetListing.value = { ...workspace.assetListing.value!, files: rest };
    });
    await settle();
    expect(title()).toBe("harbor");
    expect(subtitle()).toBe("Image · PNG");
    expect(details()).toContain("File: 600 B");
  });

  it("shows a link's address as it is now when it changes elsewhere, and keeps a link hidden by a search when its type changes", async () => {
    workspace.assetListing.value = {
      ...workspace.assetListing.value!,
      files: {
        ...workspace.assetListing.value!.files,
        "Assets/Images/Backdrops/sky.url": { ...fact(27), address: "https://example.com/sky.png" },
      },
    };
    lists({ assetsType: "image", assetsFolders: { image: "Assets/Images/Backdrops" } });
    await mount();
    await open("sky");
    const relink = async (address: string) => {
      await act(async () => {
        const listing = workspace.assetListing.value!;
        workspace.assetListing.value = {
          ...listing,
          files: { ...listing.files, "Assets/Images/Backdrops/sky.url": { ...fact(28), address } },
        };
      });
      await settle();
    };
    await relink("https://example.com/dusk.png");
    expect(region()!.querySelector<HTMLInputElement>('input[aria-label="Address"]')!.value).toBe(
      "https://example.com/dusk.png",
    );
    await search("market");
    expect(title()).toBe("sky");
    await relink("https://example.com/rain.mp3");
    expect(title()).toBe("sky");
    expect(subtitle()).toBe("Audio · MP3 · link");
    expect(region()!.querySelector<HTMLInputElement>('input[aria-label="Address"]')!.value).toBe(
      "https://example.com/rain.mp3",
    );
  });

  it("shows a link's address, saves a new one, opens it, and downloads the link file, but offers no Replace", async () => {
    workspace.assetListing.value = {
      ...workspace.assetListing.value!,
      files: {
        ...workspace.assetListing.value!.files,
        "Assets/Images/Backdrops/sky.url": { ...fact(27), address: "https://example.com/sky.png" },
      },
    };
    lists({ assetsType: "image", assetsFolders: { image: "Assets/Images/Backdrops" } });
    await mount();
    await open("sky");
    expect(subtitle()).toBe("Image · PNG · link");
    expect(region()!.querySelector("[data-inspector-replace]")).toBeNull();
    const field = region()!.querySelector<HTMLInputElement>('input[aria-label="Address"]')!;
    expect(field.value).toBe("https://example.com/sky.png");
    expect(region()!.querySelector<HTMLAnchorElement>("a[data-inspector-open-link]")!.getAttribute("href")).toBe(
      "https://example.com/sky.png",
    );
    const save = region()!.querySelector<HTMLButtonElement>("[data-inspector-save-address]")!;
    expect(save.disabled).toBe(true);
    await act(async () => {
      field.value = "https://example.com/sky2.png";
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(save.disabled).toBe(false);
    await click(save);
    expect(assets.setAddress).toHaveBeenCalledWith("Assets/Images/Backdrops/sky.url", "https://example.com/sky2.png");
    expect(snackbar.value?.message).toBe("Address saved.");
    await click(region()!.querySelector<HTMLElement>("[data-inspector-download]"));
    expect(assets.downloadAll).toHaveBeenCalledWith(["Assets/Images/Backdrops/sky.url"]);
  });

  it("is a full-screen sheet with Back in the compact layout, and Back returns focus to the tile that opened it", async () => {
    layout.value = "compact";
    lists({ assetsType: "image", assetsFolders: { image: "Assets/Images/Backdrops" } });
    await mount();
    await open("market");
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.contains(region())).toBe(true);
    expect(dialog.className).toContain("h-full");
    expect(dock().contains(region())).toBe(false);
    expect(closeButton().getAttribute("aria-label")).toBe("Back to the collection");
    expect(document.activeElement).toBe(closeButton());
    const tile = rowFor("Assets/Images/Backdrops/market.png");
    expect(tile.closest("[data-tile]")).not.toBeNull();
    await click(closeButton());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
    await settle();
    expect(region()).toBeNull();
    expect(document.activeElement).toBe(tile);
  });

  it("lists each use as one row naming its script and line, with the line beneath", async () => {
    const use = (path: string, line: number, text: string, role: "sound" | "define" = "sound") => ({
      uri: `file:///p/${path}`,
      path,
      range: { start: { line, character: 2 }, end: { line, character: 12 } },
      role,
      text,
    });
    workspace.assetUsage.value = {
      projectId: PROJECT,
      version: 1,
      uses: {
        "Assets/Audio/Sounds/door_chime.wav": [
          use("Scripts/market.sd", 2, "  ((door_chime))"),
          use("main.sd", 11, "  ((play sound door_chime))"),
          use("main.sd", 3, "  ((door_chime))"),
          use("Scripts/Definitions/audio.sd", 0, "define door_chime as sound with", "define"),
        ],
      },
      order: ["main.sd", "Scripts/market.sd", "Scripts/Definitions/audio.sd"],
    };
    await mount();
    await open("door_chime");
    expect(sectionTitles()).toContain("Used in 4 lines");
    expect(details()).toContain("Used as: Sound, Define");
    const rows = [...region()!.querySelectorAll<HTMLElement>('section[aria-label="Uses"] li button')];
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Open main at line 4",
      "Open main at line 12",
      "Open audio at line 1",
      "Open market at line 3",
    ]);
    expect(rows.map((row) => [...row.querySelectorAll("span, small")].filter((el) => !el.children.length).map((el) => el.textContent))).toEqual([
      ["main · line 4", "((door_chime))"],
      ["main · line 12", "((play sound door_chime))"],
      ["audio · line 1", "define door_chime as sound with"],
      ["market · line 3", "((door_chime))"],
    ]);
    expect(rows.every((row) => row.className.split(" ").includes("min-h-[52px]"))).toBe(true);
    expect(rows[0]!.closest("ul")!.className.split(" ")).toEqual(expect.arrayContaining(["grid", "gap-[3px]"]));
    expect(region()!.querySelector('section[aria-label="Uses"] h3 + * h3, section[aria-label="Uses"] section')).toBeNull();
    await click(rows[1]);
    expect(window.revealDocument).toHaveBeenCalledWith("file:///p/main.sd", {
      start: { line: 11, character: 2 },
      end: { line: 11, character: 12 },
    });
  });

  it("lists each use as a row that opens the script at that line", async () => {
    const range = { start: { line: 4, character: 15 }, end: { line: 4, character: 25 } };
    const played = (at: typeof range) => ({
      uri: "file:///p/main.sd",
      path: "main.sd",
      range: at,
      role: "sound" as const,
      text: "  ((play sound door_chime))",
    });
    workspace.assetUsage.value = {
      projectId: PROJECT,
      version: 1,
      uses: {
        "Assets/Audio/Sounds/door_chime.wav": [
          played({ start: { line: 9, character: 15 }, end: { line: 9, character: 25 } }),
          played(range),
        ],
      },
      order: ["main.sd"],
    };
    await mount();
    await open("door_chime");
    expect(assets.watchFacts.mock.calls[0]![0]).toEqual(["Assets/Audio/Sounds/door_chime.wav"]);
    expect(sectionTitles()).toContain("Used in 2 lines");
    expect(details()).toContain("Used as: Sound");
    const use = region()!.querySelector<HTMLElement>('button[aria-label="Open main at line 5"]');
    await click(use);
    expect(window.revealDocument).toHaveBeenCalledWith("file:///p/main.sd", range);
  });

  it("reads a sound's length through the shared duration reader, and again when Replace changes its file", async () => {
    const lengths: Record<string, number> = { "/p/512": 3.4, "/p/512?v=2": 7.6 };
    assets.measureDurations.mockImplementation(async (paths: readonly string[]) => {
      const files = workspace.assetListing.value!.files;
      workspace.assetDurations.value = {
        ...workspace.assetDurations.value,
        ...Object.fromEntries(paths.map((path) => [files[path]!.src!, lengths[files[path]!.src!] ?? null])),
      };
    });
    await mount();
    await open("door_chime");
    expect(assets.measureDurations).toHaveBeenCalledWith(["Assets/Audio/Sounds/door_chime.wav"]);
    expect(details()).toContain("Length: 0:03");
    await act(async () => {
      const files = workspace.assetListing.value!.files;
      workspace.assetListing.value = {
        ...workspace.assetListing.value!,
        files: { ...files, "Assets/Audio/Sounds/door_chime.wav": { ...files["Assets/Audio/Sounds/door_chime.wav"]!, src: "/p/512?v=2" } },
      };
    });
    await settle();
    expect(details()).toContain("Length: 0:07");
  });

  it("says a file is not used yet, with its type's note", async () => {
    await mount();
    await open("door_chime");
    expect(sectionTitles()).toContain("Not used yet");
    expect(region()!.textContent).toContain("Nothing plays it yet.");
  });

  it("says it is still looking until the project's uses are counted", async () => {
    workspace.assetUsage.value = null;
    await mount();
    await open("door_chime");
    expect(sectionTitles()).toContain("Uses");
    expect(region()!.textContent).toContain("Looking for uses…");
  });

  it("says where it is used could not be looked up when the lookup failed, rather than Not used yet", async () => {
    workspace.assetUsage.value = null;
    workspace.assetUsageFailed.value = PROJECT;
    await mount();
    await open("door_chime");
    expect(sectionTitles()).toContain("Uses");
    expect(sectionTitles()).not.toContain("Not used yet");
    expect(region()!.querySelector("[data-uses-failed]")!.textContent).toBe(
      "Where it is used could not be looked up. Edit a script to try again.",
    );
  });

  it("shows the file's problems when there are any", async () => {
    facts.problems = [{ severity: 2, message: "Malformed condition face..bad" }];
    await mount();
    await open("door_chime");
    expect(sectionTitles()[0]).toBe("Problems");
    expect(region()!.textContent).toContain("Malformed condition face..bad");
    await act(async () => facts.listeners.forEach((listener) => listener({ problems: [] })));
    expect(sectionTitles()).not.toContain("Problems");
  });

  it("zooms a picture straight on the stage, there and full size, and lists its details", async () => {
    lists({ assetsType: "image", assetsFolders: { image: "Assets/Images/Backdrops" } });
    workspace.assetSizes.value = { "/p/600": { width: 1920, height: 1080 } };
    await mount();
    await open("harbor");
    const frame = region()!.querySelector<HTMLElement>("[data-zoom-frame]")!;
    expect(frame.getAttribute("aria-roledescription")).toBe("zoomable picture");
    expect(frame.querySelector("img")!.getAttribute("src")).toBe("/p/600");
    expect(frame.className.split(" ")).toContain("bg-stage");
    expect(frame.querySelector("[class*=checker]")).toBeNull();
    expect(frame.querySelector("[data-zoom-level]")!.textContent).toBe("100%");
    expect(details()).toEqual([
      "Type: Image · PNG",
      "Add menu: Backdrop, from the Backdrops folder",
      "Size: 1920 × 1080",
      "File: 600 B",
      "Where: Images/Backdrops",
    ]);
    expect(assets.measureImages).not.toHaveBeenCalledWith(["Assets/Images/Backdrops/harbor.png"]);
  });

  it("gives a video its player, a font its specimen and a text file its contents, and a sound no frame here", async () => {
    lists({ assetsType: "video", assetsFolders: {} });
    await mount();
    await open("intro");
    const video = region()!.querySelector("video")!;
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.getAttribute("src")).toBe("/p/4");
    await key(closeButton(), "Escape");

    await act(async () => lists({ assetsType: "font" }));
    await rerender();
    await open("courier_prime");
    const specimen = region()!.querySelector("[data-font-specimen]")!;
    expect(specimen.textContent).toContain("courier_prime");
    const samples = [...specimen.querySelectorAll("p")].slice(1);
    expect(samples.map((sample) => sample.className)).toEqual(["text-[28px]/[1.2]", "text-[18px]/[1.3]", "text-[13px]/[1.4]"]);
    expect(samples.every((sample) => sample.parentElement!.className.includes("[&>p]:fade-edge"))).toBe(true);
    await key(closeButton(), "Escape");

    await act(async () => lists({ assetsType: "text" }));
    await rerender();
    await open("notes");
    await settle();
    expect(assets.readText).toHaveBeenCalledWith("Assets/Text/notes.txt");
    expect(region()!.querySelector("[data-text-contents]")!.textContent).toBe("The lamps come on one by one.");
    await key(closeButton(), "Escape");

    await act(async () => lists({ assetsType: "audio", assetsFolders: { audio: "Assets/Audio/Sounds" } }));
    await rerender();
    await open("bell");
    expect(region()!.querySelector("[data-zoom-frame]")).toBeNull();
  });

  it("forgets a video's length when Replace changes its file, and reads the new one's", async () => {
    lists({ assetsType: "video", assetsFolders: {} });
    await mount();
    await open("intro");
    const metadata = async (seconds: number) => {
      const video = region()!.querySelector("video")!;
      Object.defineProperty(video, "duration", { value: seconds, configurable: true });
      await act(async () => {
        video.dispatchEvent(new Event("loadedmetadata"));
      });
      await settle();
    };
    await metadata(84);
    expect(details()).toContain("Length: 1:24");
    const replaceWith = async (src: string) => {
      await act(async () => {
        const listing = workspace.assetListing.value!;
        workspace.assetListing.value = {
          ...listing,
          files: { ...listing.files, "Assets/Video/intro.webm": { ...listing.files["Assets/Video/intro.webm"]!, src } },
        };
      });
      await settle();
    };
    await replaceWith("/p/4?v=2");
    const replaced = region()!.querySelector("video")!;
    expect(replaced.getAttribute("src")).toBe("/p/4?v=2");
    await act(async () => {
      replaced.dispatchEvent(new Event("error"));
    });
    expect(details().some((row) => row.startsWith("Length"))).toBe(false);
    expect(region()!.querySelector("[data-frame-failed]")!.textContent).toBe("This video could not be played here.");
    await replaceWith("/p/4?v=3");
    expect(region()!.querySelector("[data-frame-failed]")).toBeNull();
    await metadata(2);
    expect(details()).toContain("Length: 0:02");
  });

  it("asks again for a file's uses and problems when Replace or a sync changes the file, and not on a re-render", async () => {
    await mount();
    await open("door_chime");
    expect(assets.watchFacts).toHaveBeenCalledTimes(1);
    await rerender();
    expect(assets.watchFacts).toHaveBeenCalledTimes(1);
    await act(async () => {
      const listing = workspace.assetListing.value!;
      workspace.assetListing.value = {
        ...listing,
        files: {
          ...listing.files,
          "Assets/Audio/Sounds/door_chime.wav": { ...listing.files["Assets/Audio/Sounds/door_chime.wav"]!, src: "/p/512?v=2" },
        },
      };
    });
    await settle();
    expect(assets.watchFacts).toHaveBeenCalledTimes(2);
    expect(assets.watchFacts.mock.calls[1]![0]).toEqual(["Assets/Audio/Sounds/door_chime.wav"]);
    expect(facts.listeners).toHaveLength(1);
  });

  it("says its problems could not be checked when that lookup failed, rather than showing none", async () => {
    facts.problems = null;
    await mount();
    await open("door_chime");
    expect(sectionTitles()[0]).toBe("Problems");
    expect(region()!.querySelector("[data-problems-failed]")!.textContent).toBe(
      "Its problems could not be checked. Edit a script to try again.",
    );
  });

  it("says a video or a picture that cannot be loaded cannot be shown, instead of an empty frame", async () => {
    lists({ assetsType: "video", assetsFolders: {} });
    await mount();
    await open("intro");
    await act(async () => {
      region()!.querySelector("video")!.dispatchEvent(new Event("error"));
    });
    expect(region()!.querySelector("[data-frame-failed]")!.textContent).toBe("This video could not be played here.");
    await key(closeButton(), "Escape");

    await act(async () => lists({ assetsType: "image", assetsFolders: { image: "Assets/Images/Backdrops" } }));
    await rerender();
    await open("harbor");
    expect(region()!.querySelector("[data-frame-failed]")).toBeNull();
    await act(async () => {
      region()!.querySelector("[data-zoom-frame] img")!.dispatchEvent(new Event("error"));
    });
    expect(region()!.querySelector("[data-frame-failed]")!.textContent).toBe("This picture could not be shown.");
  });

  it("returns focus to the search field when the item it closes is not in the shown list", async () => {
    const searchField = () => host!.querySelector<HTMLInputElement>('input[aria-label="Search assets"]')!;
    const nextFrame = () =>
      act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      });
    lists({ assetsType: "image", assetsFolders: { image: "Assets/Images/Backdrops" } });
    await mount();
    await open("harbor");
    await search("market");
    expect(title()).toBe("harbor");
    await key(closeButton(), "Escape");
    await nextFrame();
    expect(region()).toBeNull();
    expect(document.activeElement).toBe(searchField());

    await search("");
    await open("harbor");
    await act(async () => lists({ assetsFolders: { image: "Assets/Images" } }));
    await rerender();
    expect(title()).toBe("harbor");
    await key(closeButton(), "Escape");
    await nextFrame();
    expect(region()).toBeNull();
    expect(document.activeElement).toBe(searchField());
  });

  it("moves focus to Close when the focused player goes because the video cannot play, so Escape still closes", async () => {
    lists({ assetsType: "video", assetsFolders: {} });
    await mount();
    await open("intro");
    const video = region()!.querySelector("video")!;
    video.tabIndex = 0;
    video.focus();
    expect(document.activeElement).toBe(video);
    await act(async () => {
      video.dispatchEvent(new Event("error"));
    });
    await settle();
    expect(document.activeElement).toBe(closeButton());
    await key(closeButton(), "Escape");
    expect(region()).toBeNull();
  });

  it("tries a font again when it is opened again after a load that failed", async () => {
    const original = (globalThis as { FontFace?: unknown }).FontFace;
    const fonts = (document as { fonts?: unknown }).fonts;
    let loads = 0;
    (globalThis as { FontFace?: unknown }).FontFace = class {
      load() {
        loads += 1;
        return loads === 1 ? Promise.reject(new Error("offline")) : Promise.resolve(this);
      }
    };
    Object.defineProperty(document, "fonts", { value: { add() {} }, configurable: true });
    try {
      workspace.assetListing.value = {
        ...workspace.assetListing.value!,
        files: { ...workspace.assetListing.value!.files, "Assets/Fonts/courier_prime.ttf": { ...fact(2049), src: "/p/retry-font" } },
      };
      lists({ assetsType: "font", assetsFolders: {} });
      await mount();
      await open("courier_prime");
      await settle();
      expect(region()!.querySelector("[data-font-failed]")).not.toBeNull();
      await key(closeButton(), "Escape");
      await open("courier_prime");
      await settle();
      expect(loads).toBe(2);
      expect(region()!.querySelector("[data-font-failed]")).toBeNull();
      expect(region()!.querySelector("[data-font-specimen]")!.textContent).toContain("The quick brown fox");
    } finally {
      (globalThis as { FontFace?: unknown }).FontFace = original;
      Object.defineProperty(document, "fonts", { value: fonts, configurable: true });
    }
  });

  it("says a font that cannot be loaded cannot be shown, instead of leaving its frame blank", async () => {
    const original = (globalThis as { FontFace?: unknown }).FontFace;
    (globalThis as { FontFace?: unknown }).FontFace = class {
      load() {
        return Promise.reject(new Error("bad font"));
      }
    };
    try {
      lists({ assetsType: "font", assetsFolders: {} });
      await mount();
      await open("courier_prime");
      await settle();
      const specimen = region()!.querySelector("[data-font-specimen]")!;
      expect(specimen.hasAttribute("data-ready")).toBe(true);
      expect(specimen.querySelector("[data-font-failed]")!.textContent).toBe(
        "This font could not be read, so it cannot be shown here.",
      );
      expect(specimen.textContent).not.toContain("The quick brown fox");
    } finally {
      (globalThis as { FontFace?: unknown }).FontFace = original;
    }
  });

  it("replaces the file with the one picked, says why a refused one is refused, and downloads", async () => {
    await mount();
    await open("door_chime");
    const picker = region()!.querySelector<HTMLInputElement>("[data-inspector-picker]")!;
    const choose = async (file: File) => {
      Object.defineProperty(picker, "files", { value: [file], configurable: true });
      await act(async () => {
        picker.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await settle();
    };
    await choose(new File(["wav"], "bell2.wav"));
    expect(assets.replace).toHaveBeenCalledWith(
      "Assets/Audio/Sounds/door_chime.wav",
      expect.objectContaining({ name: "bell2.wav" }),
    );
    assets.replace.mockRejectedValueOnce(
      new NameError("harbor.png is an image, and door_chime.wav is a sound. Choose a sound to replace it."),
    );
    await choose(new File(["png"], "harbor.png"));
    expect(snackbar.value?.message).toBe(
      "harbor.png is an image, and door_chime.wav is a sound. Choose a sound to replace it.",
    );
    await click(region()!.querySelector<HTMLElement>("[data-inspector-download]"));
    expect(assets.downloadAll).toHaveBeenCalledWith(["Assets/Audio/Sounds/door_chime.wav"]);
  });
});

describe("the inspector when its item is renamed, moved or deleted from the page", () => {
  const P = "Assets/Images/Portraits";
  const menu = async (name: string, item: string, within: "row" | "head" = "row") => {
    const trigger = all<HTMLElement>(`button[aria-label="Options for ${name}"]`).find(
      (button) => (within === "head") === !!region()?.querySelector("header")?.contains(button),
    )!;
    await act(async () => {
      trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    });
    await settle();
    await vi.waitFor(() => expect(all('[role="menuitem"]').length).toBeGreaterThan(0));
    await click(all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.includes(item)));
  };
  const setFiles = (files: Record<string, ReturnType<typeof fact>>, folders: string[] = []) => {
    workspace.assetListing.value = { projectId: PROJECT, folders, files };
  };

  beforeEach(() => {
    lists({ assetsType: "image", assetsFolders: { image: P } });
    setFiles({ [`${P}/imani.png`]: fact(8001), [`${P}/imani@night.png`]: fact(8002), [`${P}/bunny.png`]: fact(8003) }, [`${P}/Cast`]);
  });

  it("follows a rename of the stack it shows, though the listing changes before the rename returns", async () => {
    assets.rename.mockImplementationOnce(async () => {
      setFiles({ [`${P}/zadie.png`]: fact(8001), [`${P}/zadie@night.png`]: fact(8002), [`${P}/bunny.png`]: fact(8003) }, [`${P}/Cast`]);
      return `${P}/zadie.png`;
    });
    await mount();
    await open("imani");
    expect(title()).toBe("imani");
    await menu("imani", "Rename");
    const input = host!.querySelector<HTMLInputElement>('input[aria-label="Rename imani"]')!;
    await act(async () => {
      input.value = "zadie";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle();
    expect(assets.rename).toHaveBeenCalledWith(`${P}/imani.png`, "zadie");
    expect(dock().contains(region())).toBe(true);
    expect(title()).toBe("zadie");
  });

  it("follows a move of the item it shows into another folder", async () => {
    assets.move.mockImplementationOnce(async () => {
      setFiles({ [`${P}/imani.png`]: fact(8001), [`${P}/imani@night.png`]: fact(8002), [`${P}/Cast/bunny.png`]: fact(8003) }, [`${P}/Cast`]);
      return [{ from: `${P}/bunny.png`, to: `${P}/Cast/bunny.png` }];
    });
    await mount();
    await open("bunny");
    await menu("bunny", "Move");
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    await click([...dialog.querySelectorAll<HTMLElement>('[role="option"]')].find((el) => el.textContent?.includes("Cast")));
    await click([...dialog.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Move here"));
    expect(assets.move).toHaveBeenCalledWith([`${P}/bunny.png`], `${P}/Cast`);
    expect(title()).toBe("bunny");
    expect(region()!.querySelector("[data-zoom-frame] img")!.getAttribute("src")).toBe("/p/8003");
  });

  it("offers the row menu's Rename, Move, Download and Delete in its head, each acting on the item it shows", async () => {
    await mount();
    await open("imani");
    const head = region()!.querySelector<HTMLElement>('header button[aria-label="Options for imani"]')!;
    expect(head.getAttribute("aria-haspopup")).toBe("menu");
    await act(async () => {
      head.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    });
    await settle();
    await vi.waitFor(() => expect(all('[role="menuitem"]').length).toBeGreaterThan(0));
    expect(all<HTMLElement>('[role="menuitem"]').map((item) => item.textContent)).toEqual([
      "Rename",
      "Move…",
      "Download",
      "Delete",
    ]);
    await click(all<HTMLElement>('[role="menuitem"]').find((item) => item.textContent === "Download"));
    expect(assets.downloadAll).toHaveBeenCalledWith([`${P}/imani.png`]);
    await menu("imani", "Move", "head");
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("imani");
    await key(document.querySelector('[role="dialog"]')!, "Escape");
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    await menu("imani", "Rename", "head");
    const input = host!.querySelector<HTMLInputElement>('input[aria-label="Rename imani"]')!;
    expect(document.activeElement).toBe(input);
    expect(dock().contains(region())).toBe(true);
  });

  it("deletes the item it shows from its head's menu, and closes", async () => {
    assets.remove.mockImplementationOnce(async () => {
      setFiles({ [`${P}/bunny.png`]: fact(8003) }, [`${P}/Cast`]);
    });
    await mount();
    await open("imani");
    await menu("imani", "Delete", "head");
    expect(assets.remove).toHaveBeenCalledWith([`${P}/imani.png`]);
    await vi.waitFor(() => expect(region()).toBeNull());
  });

  it("closes its sheet and renames the item's row from its head's menu on a phone", async () => {
    layout.value = "phone";
    await mount(false);
    await open("imani");
    await menu("imani", "Rename", "head");
    await vi.waitFor(() => expect(region()).toBeNull());
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(host!.querySelector('input[aria-label="Rename imani"]')),
    );
  });

  it("closes when the item it shows is deleted, with focus on the page", async () => {
    assets.remove.mockImplementationOnce(async () => {
      setFiles({ [`${P}/bunny.png`]: fact(8003) }, [`${P}/Cast`]);
    });
    await mount();
    await open("imani");
    await menu("imani", "Delete");
    expect(assets.remove).toHaveBeenCalledWith([`${P}/imani.png`]);
    await vi.waitFor(() => expect(region()).toBeNull());
    await vi.waitFor(() => expect(host!.contains(document.activeElement)).toBe(true));
  });
});

describe("the Variants tester and the Files section", () => {
  const P = "Assets/Images/Portraits";
  const IMANI = [
    `${P}/imani.png`,
    `${P}/imani~face.happy.png`,
    `${P}/imani~face.sad.png`,
    `${P}/imani~mouth.closed~default.png`,
    `${P}/imani~mouth.open.png`,
    `${P}/imani@night.png`,
    `${P}/imani@night~face.happy.png`,
  ];
  const MIA = [`${P}/mia/90_body.png`, `${P}/mia/30_face.neutral~default.png`, `${P}/mia/30_face.happy.png`];
  const reference = () => region()!.querySelector("[data-variant-reference]")!.textContent;
  const group = (key: string) => region()!.querySelector<HTMLButtonElement>(`[data-variant-group="${key}"]`)!;
  const pick = async (trigger: HTMLElement, label: string) => {
    await act(async () => {
      trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    });
    await settle();
    await vi.waitFor(() => expect(all('[role="menuitemradio"]').length).toBeGreaterThan(0));
    await click(all<HTMLElement>('[role="menuitemradio"]').find((el) => el.textContent?.startsWith(label)));
  };
  const fileMenu = async (name: string, item: string) => {
    const trigger = region()!.querySelector<HTMLElement>(`button[aria-label="Options for ${name}"]`)!;
    await act(async () => {
      trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    });
    await settle();
    await vi.waitFor(() => expect(all('[role="menuitem"]').length).toBeGreaterThan(0));
    await click(all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.includes(item)));
  };

  const frameSize = { width: 300, height: 400 };
  const frameObservers: { callback: () => void; target?: Element }[] = [];
  const restoreFrame: (() => void)[] = [];

  beforeEach(() => {
    lists({ assetsType: "image", assetsFolders: { image: P } });
    workspace.assetListing.value = {
      projectId: PROJECT,
      folders: [`${P}/mia`],
      files: Object.fromEntries([...IMANI, ...MIA].map((path, i) => [path, fact(1024 * (i + 1))])),
    };
    Object.assign(frameSize, { width: 300, height: 400 });
    frameObservers.length = 0;
    for (const [property, side] of [
      ["offsetWidth", "width"],
      ["offsetHeight", "height"],
    ] as const) {
      const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, property)!;
      Object.defineProperty(HTMLElement.prototype, property, {
        configurable: true,
        get(this: HTMLElement) {
          return this.matches("[data-zoom-frame]") ? frameSize[side] : 0;
        },
      });
      restoreFrame.push(() => Object.defineProperty(HTMLElement.prototype, property, original));
    }
    const ratio = Object.getOwnPropertyDescriptor(globalThis, "devicePixelRatio");
    Object.defineProperty(globalThis, "devicePixelRatio", { configurable: true, value: 3 });
    restoreFrame.push(() =>
      ratio ? Object.defineProperty(globalThis, "devicePixelRatio", ratio) : delete (globalThis as { devicePixelRatio?: number }).devicePixelRatio,
    );
    const observer = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      entry: { callback: () => void; target?: Element };
      constructor(callback: () => void) {
        this.entry = { callback };
        frameObservers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      unobserve() {}
      disconnect() {
        frameObservers.splice(frameObservers.indexOf(this.entry), 1);
      }
    } as unknown as typeof ResizeObserver;
    restoreFrame.push(() => {
      globalThis.ResizeObserver = observer;
    });
  });

  afterEach(() => {
    restoreFrame.splice(0).reverse().forEach((restore) => restore());
  });

  it("asks for the picture at the frame's size in device pixels, and again when the frame grows", async () => {
    await mount();
    await open("imani");
    await pick(group("face"), "Happy");
    expect(assets.watchPicture).toHaveBeenLastCalledWith(`${P}/imani.png`, { image: "imani", attributes: ["happy"] }, 1280, expect.any(Function));
    const calls = assets.watchPicture.mock.calls.length;
    Object.assign(frameSize, { width: 450, height: 600 });
    await act(async () => {
      frameObservers.filter((entry) => entry.target?.matches("[data-zoom-frame]")).forEach((entry) => entry.callback());
    });
    await settle();
    expect(assets.watchPicture).toHaveBeenCalledTimes(calls + 1);
    expect(assets.watchPicture).toHaveBeenLastCalledWith(`${P}/imani.png`, { image: "imani", attributes: ["happy"] }, 1920, expect.any(Function));
    Object.assign(frameSize, { width: 460, height: 610 });
    await act(async () => {
      frameObservers.filter((entry) => entry.target?.matches("[data-zoom-frame]")).forEach((entry) => entry.callback());
    });
    await settle();
    expect(assets.watchPicture).toHaveBeenCalledTimes(calls + 1);
  });

  it("counts a stack's uses and roles from the shared usage map, as a portrait in two scripts", async () => {
    const shown = (path: string, line: number, file: string) => ({
      uri: `file:///p/${path}`,
      path,
      range: { start: { line, character: 4 }, end: { line, character: 9 } },
      role: "portrait" as const,
      text: `  [[${file}]]`,
    });
    workspace.assetUsage.value = {
      projectId: PROJECT,
      version: 1,
      uses: {
        [`${P}/imani.png`]: [shown("main.sd", 3, "imani"), shown("Scripts/market.sd", 1, "imani")],
        [`${P}/imani@night.png`]: [shown("Scripts/market.sd", 6, "imani@night"), shown("main.sd", 3, "imani")],
      },
      order: ["main.sd", "Scripts/market.sd"],
    };
    await mount();
    await open("imani");
    expect(sectionTitles()).toContain("Used in 3 lines");
    expect(details()).toContain("Used as: Portrait");
    expect(
      [...region()!.querySelectorAll<HTMLElement>('section[aria-label="Uses"] li button')].map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Open main at line 4", "Open market at line 2", "Open market at line 7"]);
  });

  it("offers a row per group, writes the reference live, shows the engine's picture, and resets", async () => {
    await mount();
    await open("imani");
    expect(subtitle()).toBe("Image · PNG · 8 variants");
    expect(sectionTitles()).toEqual(["Variants", "Details", "Files", "Not used yet"]);
    expect([group("@"), group("face"), group("mouth")].map((button) => button.getAttribute("aria-label"))).toEqual([
      "Alternate: As is",
      "Face: As is",
      "Mouth: Closed",
    ]);
    expect(reference()).toBe("[[imani]]");
    expect(region()!.querySelector("[data-variant-reset]")).toBeNull();
    await pick(group("face"), "Happy");
    expect(reference()).toBe("[[imani:happy]]");
    expect(assets.watchPicture).toHaveBeenLastCalledWith(`${P}/imani.png`, { image: "imani", attributes: ["happy"] }, 1280, expect.any(Function));
    expect(region()!.querySelector("[data-zoom-frame] img")!.getAttribute("src")).toBe("/picture/imani~happy");
    await pick(group("@"), "Night");
    expect(reference()).toBe("[[imani@night:happy]]");
    await click(region()!.querySelector<HTMLElement>("[data-variant-reset]"));
    expect(reference()).toBe("[[imani]]");
  });

  it("puts each group's name above its menu, and shows the count in the header until a choice, then Reset", async () => {
    await mount();
    await open("imani");
    const cells = [...region()!.querySelectorAll<HTMLElement>("[data-variant-cell]")];
    expect(
      cells.map((cell) => [cell.firstElementChild!.textContent, cell.lastElementChild!.getAttribute("data-variant-group")]),
    ).toEqual([
      ["Alternate", "@"],
      ["Face", "face"],
      ["Mouth", "mouth"],
    ]);
    const aside = () =>
      region()!.querySelector('section[aria-label="Variants"] h3')!.nextElementSibling!.textContent;
    expect(aside()).toBe("8 variants");
    expect(group("face").hasAttribute("data-changed")).toBe(false);
    await pick(group("face"), "Happy");
    expect(group("face").hasAttribute("data-changed")).toBe(true);
    expect(aside()).toBe("Reset");
    await click(region()!.querySelector<HTMLElement>("[data-variant-reset]"));
    expect(aside()).toBe("8 variants");
  });

  it("puts an option's Default hint beneath its name in a group's menu", async () => {
    await mount();
    await open("imani");
    await act(async () => {
      group("mouth").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    });
    await settle();
    const items = await vi.waitFor(() => {
      const found = all<HTMLElement>('[role="menuitemradio"]');
      expect(found.length).toBe(2);
      return found;
    });
    const closed = items.find((item) => item.textContent?.startsWith("Closed"))!;
    const text = closed.querySelector<HTMLElement>("[data-dropdown-item-text]")!;
    expect([...text.children].map((child) => [child.tagName, child.textContent])).toEqual([
      ["SPAN", "Closed"],
      ["SMALL", "Default"],
    ]);
    expect(items.find((item) => item.textContent?.startsWith("Open"))!.querySelector("small")).toBeNull();
    await key(closed, "Escape");
  });

  it("draws an on/off group as a switch, off at rest, after the menus, with both files or only the on file", async () => {
    workspace.assetListing.value = {
      projectId: PROJECT,
      folders: [],
      files: Object.fromEntries(
        [
          `${P}/tower.png`,
          `${P}/tower~flag.on.png`,
          `${P}/tower~flag.off.png`,
          `${P}/tower~banner.on.png`,
          `${P}/tower~face.happy.png`,
          `${P}/rooftop.png`,
          `${P}/rooftop~lamp.on.png`,
        ].map((path, i) => [path, fact(512 * (i + 1))]),
      ),
    };
    await mount();
    const switches = () => [...region()!.querySelectorAll<HTMLInputElement>('[role="switch"]')];
    const cells = () =>
      [...region()!.querySelectorAll<HTMLElement>("[data-variant-cell]")].map((cell) => [
        cell.firstElementChild!.textContent,
        cell.lastElementChild!.getAttribute("role") ?? cell.lastElementChild!.getAttribute("data-variant-group"),
      ]);
    await open("tower");
    expect(subtitle()).toBe("Image · PNG · 8 variants");
    expect(cells()).toEqual([
      ["Face", "face"],
      ["Banner", "switch"],
      ["Flag", "switch"],
    ]);
    expect(switches().map((input) => [input.getAttribute("aria-label"), input.getAttribute("aria-checked"), input.checked])).toEqual([
      ["Banner", "false", false],
      ["Flag", "false", false],
    ]);
    expect(region()!.querySelector('[data-variant-group="flag"]')).toBeNull();
    await click(switches()[1]);
    expect(reference()).toBe("[[tower:flag]]");
    expect(switches()[1]!.getAttribute("aria-checked")).toBe("true");
    expect(region()!.querySelector("[data-variant-reset]")).not.toBeNull();
    await click(switches()[1]);
    expect(reference()).toBe("[[tower]]");

    await click(closeButton());
    await open("rooftop");
    expect(subtitle()).toBe("Image · PNG · 2 variants");
    expect(cells()).toEqual([["Lamp", "switch"]]);
    expect(switches()[0]!.getAttribute("aria-checked")).toBe("false");
    await click(switches()[0]);
    expect(reference()).toBe("[[rooftop:lamp]]");
    expect(rowFor(`${P}/rooftop.png`).getAttribute("aria-label")).toContain("2 variants");
  });

  it("keeps the picture pinned above the Variants while they scroll, and pins nothing for a single picture", async () => {
    await mount();
    await open("imani");
    const bench = region()!.querySelector<HTMLElement>("[data-variant-bench]")!;
    expect(bench.parentElement!.matches("[data-inspector-body]")).toBe(true);
    const stage = bench.firstElementChild as HTMLElement;
    expect(stage.querySelector("[data-zoom-frame]")).not.toBeNull();
    expect(stage.className.split(" ")).toEqual(expect.arrayContaining(["sticky", "top-0"]));
    expect(bench.lastElementChild!.matches('section[aria-label="Variants"]')).toBe(true);
    await click(closeButton());
    lists({ assetsType: "image", assetsFolders: { image: "Assets/Images/Backdrops" } });
    workspace.assetListing.value = { projectId: PROJECT, folders: [], files: { "Assets/Images/Backdrops/harbor.png": fact(600) } };
    await settle();
    await open("harbor");
    expect(region()!.querySelector("[data-variant-bench]")).toBeNull();
    expect(region()!.querySelector(".sticky")).toBeNull();
  });

  it("inserts the reference shown at the script's caret, and says why it cannot while no script has a caret", async () => {
    await mount();
    await open("imani");
    const insert = () => region()!.querySelector<HTMLButtonElement>("[data-variant-insert]")!;
    expect(insert().textContent).toBe("Insert at caret");
    expect(insert().disabled).toBe(true);
    const reason = document.getElementById(insert().getAttribute("aria-describedby")!)!;
    expect(reason.textContent).toBe("Open a script and place the caret there to insert at it.");
    const logic = workspace.current.panes.logic;
    await act(async () => {
      workspace.current = {
        ...workspace.current,
        panes: {
          ...workspace.current.panes,
          logic: {
            ...logic,
            view: "list",
            panel: "main",
            panels: {
              ...logic.panels,
              main: {
                ...logic.panels.main,
                activeEditor: {
                  open: true,
                  filename: "main.sd",
                  selectedRange: { start: { line: 3, character: 2 }, end: { line: 3, character: 2 } },
                },
              },
            },
          },
        },
      };
    });
    await settle();
    expect(insert().disabled).toBe(false);
    expect(insert().hasAttribute("aria-describedby")).toBe(false);
    expect(region()!.querySelector("[data-variant-no-caret]")).toBeNull();
    await pick(group("face"), "Happy");
    await click(insert());
    expect(window.insertReference).toHaveBeenCalledWith("main.sd", "portrait", "[[imani:happy]]");
  });

  it("opens the picture full size on the stage and closes it back to the inspector with focus on its button", async () => {
    await mount();
    await open("imani");
    await pick(group("face"), "Happy");
    const expand = region()!.querySelector<HTMLButtonElement>("[data-zoom-frame] [data-zoom-expand]")!;
    expect(expand.getAttribute("aria-label")).toBe("View full size");
    expand.focus();
    await click(expand);
    const full = await vi.waitFor(() => {
      const found = all<HTMLElement>('[role="dialog"]').find((dialog) => dialog.textContent?.includes("imani full size"));
      expect(found).toBeTruthy();
      return found!;
    });
    expect(full.querySelector("[data-zoom-frame] img")!.getAttribute("src")).toBe("/picture/imani~happy");
    expect(full.querySelector<HTMLElement>("[data-zoom-frame]")!.className.split(" ")).toContain("bg-stage");
    expect(full.querySelector("[class*=checker]")).toBeNull();
    const edge = Math.ceil((Math.max(innerWidth, innerHeight) * 3) / 128) * 128;
    expect(edge).toBeGreaterThan(1280);
    expect(assets.watchPicture).toHaveBeenLastCalledWith(`${P}/imani.png`, { image: "imani", attributes: ["happy"] }, edge, expect.any(Function));
    await key(full, "Escape");
    await vi.waitFor(() => expect(all('[role="dialog"]').some((dialog) => dialog.textContent?.includes("imani full size"))).toBe(false));
    await vi.waitFor(() => expect(document.activeElement).toBe(expand));
    expect(region()).not.toBeNull();
  });

  it("shows the reference as a portrait from its folder, as a backdrop when chosen, and copies it", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await mount();
    await open("imani");
    const backdrop = region()!.querySelector<HTMLInputElement>('input[type="radio"][value="backdrop"]')!;
    expect(region()!.querySelector<HTMLInputElement>('input[type="radio"][value="portrait"]')!.checked).toBe(true);
    await act(async () => {
      backdrop.checked = true;
      backdrop.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(reference()).toBe("[[show backdrop imani]]");
    await click(region()!.querySelector<HTMLElement>("[data-variant-copy]"));
    expect(writeText).toHaveBeenCalledWith("[[show backdrop imani]]");
    expect(snackbar.value?.message).toBe("Copied.");
  });

  it("lists every file with its role, and renames, downloads and deletes one file", async () => {
    await mount();
    await open("imani");
    const files = region()!.querySelector<HTMLElement>('section[aria-label="Files"]')!;
    expect(files.querySelector("h3")!.nextElementSibling!.textContent).toBe("7 files · 28 kB");
    const rows = [...files.querySelectorAll<HTMLElement>("[data-file-path]")].map((row) => row.textContent);
    expect(rows).toContain("imani~mouth.closed~default.pngLayer · mouth.closed · default · 4 kB");
    expect(rows).toContain("imani@night.pngAlternate · night · 6 kB");
    await fileMenu("imani~face.sad.png", "Rename");
    const input = host!.querySelector<HTMLInputElement>('input[aria-label="Rename imani~face.sad.png"]')!;
    expect(input.value).toBe("imani~face.sad");
    await act(async () => {
      input.value = "imani~face.glum";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle();
    expect(assets.renameMember).toHaveBeenCalledWith(`${P}/imani~face.sad.png`, "imani~face.glum");
    await fileMenu("imani@night.png", "Download");
    expect(assets.download).toHaveBeenCalledWith(`${P}/imani@night.png`);
    await fileMenu("imani~mouth.open.png", "Delete");
    await click(all<HTMLElement>('[role="dialog"] button').find((button) => button.textContent === "Delete"));
    expect(assets.removeMember).toHaveBeenCalledWith(`${P}/imani~mouth.open.png`);
    await click(region()!.querySelector<HTMLElement>("[data-inspector-download]"));
    expect(assets.downloadAll).toHaveBeenCalledWith([`${P}/imani.png`]);
  });

  it("draws nothing for a combination that shows no layer, and says when the picture could not be drawn", async () => {
    for (const answer of ["", null]) {
      assets.watchPicture.mockImplementationOnce((_path: string, _variant: unknown, _size: number, listener: (src: string | null) => void) => {
        listener(answer);
        return () => {};
      });
    }
    await mount();
    await open("imani");
    const frame = () => region()!.querySelector<HTMLElement>("[data-zoom-frame]")!;
    expect(frame().querySelector("img")).toBeNull();
    expect(frame().querySelector("[data-frame-failed]")).toBeNull();
    await pick(group("face"), "Happy");
    expect(frame().querySelector("img")).toBeNull();
    expect(frame().querySelector("[data-frame-failed]")?.textContent).toBe("This picture could not be shown.");
  });

  it("shows a combination again after another one's picture failed to load", async () => {
    await mount();
    await open("imani");
    const frame = () => region()!.querySelector<HTMLElement>("[data-zoom-frame]")!;
    await pick(group("face"), "Happy");
    await act(async () => {
      frame().querySelector("img")!.dispatchEvent(new Event("error"));
    });
    await settle();
    expect(frame().querySelector("[data-frame-failed]")).not.toBeNull();
    await pick(group("face"), "Sad");
    expect(frame().querySelector("img")!.getAttribute("src")).toBe("/picture/imani~sad");
    expect(frame().querySelector("[data-frame-failed]")).toBeNull();
  });

  it("stays open on the picture when a Files action renames, adds or deletes the file that covers it", async () => {
    const M = `${P}/mia`;
    const setFiles = (paths: string[]) => {
      workspace.assetListing.value = {
        projectId: PROJECT,
        folders: [M],
        files: Object.fromEntries(paths.map((path, i) => [path, fact(1024 * (i + 1))])),
      };
    };
    lists({ assetsType: "image", assetsFolders: { image: M } });
    setFiles([`${M}/90_body.png`, `${M}/30_face.happy.png`]);
    assets.renameMember.mockImplementationOnce(async () => {
      setFiles([`${M}/95_body.png`, `${M}/30_face.happy.png`]);
      return `${M}/95_body.png`;
    });
    await mount();
    await open("mia");
    await fileMenu("90_body.png", "Rename");
    const input = host!.querySelector<HTMLInputElement>('input[aria-label="Rename 90_body.png"]')!;
    await act(async () => {
      input.value = "95_body";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle();
    expect(title()).toBe("mia");
    await act(async () => setFiles([`${M}/99_paper.png`, `${M}/95_body.png`, `${M}/30_face.happy.png`]));
    await settle();
    expect(title()).toBe("mia");
    assets.removeMember.mockImplementationOnce(async () => setFiles([`${M}/95_body.png`, `${M}/30_face.happy.png`]));
    await fileMenu("99_paper.png", "Delete");
    await click(all<HTMLElement>('[role="dialog"] button').find((button) => button.textContent === "Delete"));
    expect(title()).toBe("mia");
    expect(region()!.querySelector('[data-file-path$="99_paper.png"]')).toBeNull();
  });

  it("says why storage refused to add or download a file", async () => {
    await mount();
    await open("imani");
    assets.addBeside.mockRejectedValueOnce({ code: -32000, message: "The storage is full" });
    const picker = region()!.querySelector<HTMLInputElement>("[data-file-picker]")!;
    Object.defineProperty(picker, "files", { value: [new File(["png"], "imani~hat.on.png")], configurable: true });
    await act(async () => {
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(snackbar.value?.message).toBe("The storage is full");
    assets.download.mockRejectedValueOnce({ code: -32000, message: "The file could not be read" });
    await fileMenu("imani@night.png", "Download");
    expect(snackbar.value?.message).toBe("The file could not be read");
  });

  it("adds a picked file beside the base", async () => {
    await mount();
    await open("imani");
    const picker = region()!.querySelector<HTMLInputElement>("[data-file-picker]")!;
    Object.defineProperty(picker, "files", { value: [new File(["png"], "imani~hat.on.png")], configurable: true });
    await act(async () => {
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(assets.addBeside).toHaveBeenCalledWith([expect.objectContaining({ name: "imani~hat.on.png" })], `${P}/imani.png`);
    expect(region()!.querySelector("[data-file-note]")!.textContent).toBe(
      "A file named imani~group.option.png adds a layer and imani@name.png another alternate.",
    );
  });

  it.each(["phone", "desktop"] as const)(
    "cancels the wheel with Escape and keeps the %s inspector open, with focus back on the group",
    async (host) => {
      layout.value = host;
      layout.coarse = true;
      await mount();
      await open("imani");
      await click(group("face"));
      const wheel = document.querySelector<HTMLElement>("[data-wheel-sheet] [role=listbox]")!;
      expect(document.activeElement).toBe(wheel);
      await key(wheel, "Escape");
      expect(document.querySelector("[data-wheel-sheet]")).toBeNull();
      expect(region()).not.toBeNull();
      expect(document.activeElement).toBe(group("face"));
    },
  );

  it("turns a wheel in a sheet on a coarse pointer, previewing as it turns and choosing with Done", async () => {
    layout.coarse = true;
    const tops = new WeakMap<Element, number>();
    const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true,
      get(this: Element) {
        return tops.get(this) ?? 0;
      },
      set(this: Element, top: number) {
        tops.set(this, top);
        this.dispatchEvent(new Event("scroll"));
      },
    });
    try {
      await mount();
      await open("imani");
      await click(group("face"));
      const wheel = document.querySelector<HTMLElement>('[role="dialog"] [role="listbox"]')!;
      expect(wheel.getAttribute("aria-label")).toBe("Face");
      await key(wheel, "ArrowDown");
      await vi.waitFor(() =>
        expect(assets.watchPicture).toHaveBeenLastCalledWith(`${P}/imani.png`, { image: "imani", attributes: ["happy"] }, 1280, expect.any(Function)),
      );
      expect(reference()).toBe("[[imani]]");
      await click(all<HTMLElement>('[role="dialog"] button').find((button) => button.textContent === "Done"));
      expect(reference()).toBe("[[imani:happy]]");
    } finally {
      Object.defineProperty(Element.prototype, "scrollTop", scrollTop);
    }
  });

  it("shows a folder stack as one picture with the same tester, and keeps its Rename and Move to the folder", async () => {
    lists({ assetsType: "image", assetsFolders: { image: `${P}/mia` } });
    await mount();
    await open("mia");
    expect(group("face").getAttribute("aria-label")).toBe("Face: Neutral");
    await pick(group("face"), "Happy");
    expect(reference()).toBe("[[mia:happy]]");
    expect(region()!.querySelector("[data-file-note]")!.textContent).toContain("NN_group.option.png");
    const trigger = all<HTMLElement>('button[aria-label="Options for mia"]')[0]!;
    await act(async () => {
      trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    });
    await settle();
    await vi.waitFor(() => expect(all('[role="menuitem"]').length).toBeGreaterThan(0));
    const items = all<HTMLElement>('[role="menuitem"]');
    const reason = "mia is made of the numbered files in its folder. Rename or move the folder mia instead.";
    for (const label of ["Rename", "Move…"]) {
      const item = items.find((el) => el.textContent?.startsWith(label))!;
      expect(item.getAttribute("aria-disabled")).toBe("true");
      expect(item.textContent).toBe(label + reason);
    }
  });
});

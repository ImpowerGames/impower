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

type Listener = (facts: { uses: unknown[]; problems: unknown[] }) => void;

const facts = vi.hoisted(() => ({ uses: [] as unknown[], problems: [] as unknown[], listeners: [] as Listener[] }));
const assets = vi.hoisted(() => ({
  watch: vi.fn(() => () => {}),
  upload: vi.fn(async (): Promise<string[]> => []),
  addLink: vi.fn(async () => ""),
  createFolder: vi.fn(async () => ""),
  rename: vi.fn(async () => ""),
  remove: vi.fn(async () => undefined),
  measureImages: vi.fn(async () => undefined),
  watchFacts: vi.fn((_paths: string[], listener: Listener) => {
    facts.listeners.push(listener);
    listener({ uses: facts.uses, problems: facts.problems });
    return () => {
      facts.listeners = facts.listeners.filter((l) => l !== listener);
    };
  }),
  replace: vi.fn(async (path: string) => path),
  download: vi.fn(async () => undefined),
  readText: vi.fn(async () => "The lamps come on one by one."),
}));
const window = vi.hoisted(() => ({
  setListState: vi.fn(),
  navigateTo: vi.fn(),
  revealDocument: vi.fn(async () => undefined),
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
  facts.uses = [];
  facts.problems = [];
  facts.listeners = [];
  for (const fn of [...Object.values(assets), ...Object.values(window)]) fn.mockClear();
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

    await open("door_chime");
    expect(document.querySelector('[role="dialog"]')!.contains(region())).toBe(true);
    layout.value = "desktop";
    await rerender();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
    expect(region()).toBeNull();
    expect(dock().childElementCount).toBe(0);
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

  it("lists each use as a row that opens the script at that line", async () => {
    const range = { start: { line: 4, character: 15 }, end: { line: 4, character: 25 } };
    facts.uses = [
      {
        uri: "file:///p/main.sd",
        uses: [
          { uri: "file:///p/main.sd", range, lineText: "  ((play sound door_chime))" },
          {
            uri: "file:///p/main.sd",
            range: { start: { line: 9, character: 15 }, end: { line: 9, character: 25 } },
            lineText: "  ((play sound door_chime))",
          },
        ],
      },
    ];
    await mount();
    await open("door_chime");
    expect(assets.watchFacts.mock.calls[0]![0]).toEqual(["Assets/Audio/Sounds/door_chime.wav"]);
    expect(sectionTitles()).toContain("Used in 2 lines");
    const use = region()!.querySelector<HTMLElement>('button[aria-label="Line 5: ((play sound door_chime))"]');
    await click(use);
    expect(window.revealDocument).toHaveBeenCalledWith("file:///p/main.sd", range);
  });

  it("says a file is not used yet, with its type's note", async () => {
    await mount();
    await open("door_chime");
    expect(sectionTitles()).toContain("Not used yet");
    expect(region()!.textContent).toContain("Nothing plays it yet.");
  });

  it("shows the file's problems when there are any", async () => {
    facts.problems = [{ severity: 2, message: "Malformed condition face..bad" }];
    await mount();
    await open("door_chime");
    expect(sectionTitles()[0]).toBe("Problems");
    expect(region()!.textContent).toContain("Malformed condition face..bad");
    await act(async () => facts.listeners.forEach((listener) => listener({ uses: [], problems: [] })));
    expect(sectionTitles()).not.toContain("Problems");
  });

  it("zooms a backdrop over a checkerboard and lists its details", async () => {
    lists({ assetsType: "image", assetsFolders: { image: "Assets/Images/Backdrops" } });
    workspace.assetSizes.value = { "/p/600": { width: 1920, height: 1080 } };
    await mount();
    await open("harbor");
    const frame = region()!.querySelector<HTMLElement>("[data-zoom-frame]")!;
    expect(frame.getAttribute("aria-roledescription")).toBe("zoomable picture");
    expect(frame.querySelector(".checkerboard img")!.getAttribute("src")).toBe("/p/600");
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
    expect(specimen.querySelectorAll("p")).toHaveLength(4);
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
    expect(assets.download).toHaveBeenCalledWith("Assets/Audio/Sounds/door_chime.wav");
  });
});

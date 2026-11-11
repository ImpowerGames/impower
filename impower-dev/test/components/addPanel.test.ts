import type { Layout } from "@impower/impower-ui/layout";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  commands: [] as [string, string][],
  inserted: [] as [string, string, string?][],
  auditions: [] as string[],
  navigated: [] as unknown[][],
  opened: 0,
  closed: 0,
  searchClosed: 0,
  context: { inScene: true } as { inScene: boolean } | null,
}));
const layout = vi.hoisted(() => ({ value: "desktop" }));

vi.mock("@impower/impower-ui/layout", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLayout: () => layout.value,
  useCoarsePointer: () => false,
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", async () => {
  const { default: store } =
    await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
  const screen = (addPanel: boolean | undefined) => {
    store.current = {
      ...store.current,
      screen: { ...store.current.screen, addPanel },
    } as typeof store.current;
  };
  return {
    Workspace: {
      audition: {
        show: (target: { kind: string; name?: string; src?: string }) => {
          calls.auditions.push(`show ${target.name ?? target.src}`);
        },
        revert: () => {
          calls.auditions.push("revert");
        },
        commit: () => {
          calls.auditions.push("commit");
        },
      },
      assets: {
        watch: () => () => {},
        measureDurations: async () => {
          store.assetDurations.value = { "blob:door": 2.4, "blob:click": 65 };
        },
      },
      search: {
        close: () => {
          calls.searchClosed++;
        },
      },
      window: {
        executeEditorCommand: (filename: string, command: string) => {
          calls.commands.push([filename, command]);
        },
        openAddPanel: () => {
          calls.opened++;
          screen(true);
        },
        closeAddPanel: () => {
          calls.closed++;
          screen(undefined);
        },
        readInsertContext: async () => calls.context,
        insertConstruct: async (filename: string, construct: string, name?: string) => {
          calls.inserted.push(name === undefined ? [filename, construct] : [filename, construct, name]);
          screen(undefined);
          return true;
        },
        readNameAtCaret: async () => null,
        readEditorKeybindings: async () => null,
        closeWritingTools: () => {},
        navigateTo: (...args: unknown[]) => {
          calls.navigated.push(["navigateTo", ...args]);
        },
        setListState: (lists: unknown) => {
          calls.navigated.push(["setListState", lists]);
        },
        openWritingTools: () => {},
      },
    },
  };
});

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { assetEndings } =
  await import("../../src/modules/spark-editor/utils/assetTypes");
const { default: WriterBar } =
  await import("../../src/modules/spark-editor/components/writer-bar/WriterBar");

let host: HTMLDivElement | undefined;

const settle = (ms = 30) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const setOpen = async (open: boolean) => {
  await act(async () => {
    workspace.current = {
      ...workspace.current,
      screen: { ...workspace.current.screen, addPanel: open || undefined },
    } as typeof workspace.current;
  });
  await settle();
};

const mount = async (canEdit = true) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(h(WriterBar, { filename: "main.sd", canEdit }), host!),
  );
  await settle();
};

const trigger = () =>
  document.querySelector<HTMLButtonElement>("[data-add-trigger]");
const panel = () =>
  document.querySelector<HTMLElement>(
    '[role="dialog"][aria-label="Add to script"]',
  );
const row = (construct: string) =>
  panel()!.querySelector<HTMLButtonElement>(
    `[data-add-construct="${construct}"]`,
  )!;

const FILES = [
  "assets/Backdrops/beach.png",
  "assets/Backdrops/beach@night.png",
  "assets/art/backdrops/city/plaza.png",
  "assets/Portraits/imani.png",
  "assets/Portraits/imani~mood.happy.png",
  "assets/Sounds/door.wav",
  "assets/Sounds/ui/click.wav",
];

const listAssets = (paths: readonly string[]) => {
  workspace.assetListing.value = {
    projectId: "local",
    folders: [],
    files: Object.fromEntries(
      paths.map((path) => [path, { modified: 0, size: 1, src: `blob:${path.split("/").pop()!.split(".")[0]}` }]),
    ),
  };
};

beforeEach(() => {
  calls.commands.length = 0;
  calls.inserted.length = 0;
  calls.auditions.length = 0;
  calls.navigated.length = 0;
  assetEndings.value = { image: ["png"], audio: ["wav"], video: [], font: [] };
  workspace.assetDurations.value = {};
  listAssets(FILES);
  calls.opened = 0;
  calls.closed = 0;
  calls.searchClosed = 0;
  calls.context = { inScene: true };
  layout.value = "desktop";
  workspace.layout.value = layout.value as Layout;
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: "local" },
    screen: {},
  };
  workspace.keyboardPanels.value = [];
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
});

describe("the Add panel on desktop", () => {
  it("opens from Add as a popover headed Add to script, closing Search, and Add becomes the close button", async () => {
    await mount();
    expect(trigger()!.textContent).toContain("Add");
    expect(trigger()!.getAttribute("aria-expanded")).toBe("false");
    await act(async () => trigger()!.click());
    await settle();
    expect(calls.opened).toBe(1);
    expect(calls.searchClosed).toBe(1);
    expect(panel()).not.toBeNull();
    expect(panel()!.querySelector("h2")?.textContent).toBe("Add to script");
    expect(panel()!.querySelector('[aria-label="Close add menu"]')).toBeNull();
    expect(trigger()!.getAttribute("aria-label")).toBe("Close add menu");
    expect(trigger()!.getAttribute("aria-expanded")).toBe("true");
    expect(trigger()!.textContent).not.toContain("Add");
  });

  it("lists the nine constructs in the prototype's order, each with its help, pickers with an arrow", async () => {
    await mount();
    await setOpen(true);
    const rows = Array.from(
      panel()!.querySelectorAll<HTMLButtonElement>("[data-add-construct]"),
    );
    expect(
      rows.map((button) => [
        button.dataset["addConstruct"],
        button.querySelector("strong")?.textContent,
        button.querySelector("small")?.textContent,
        button.querySelectorAll("svg").length,
      ]),
    ).toEqual([
      ["character", "Character", "Define a new character.", 1],
      ["scene", "Scene", "Start a new part of the story.", 1],
      ["branch", "Branch", "Create a named path inside this scene.", 1],
      ["choose", "Choice Menu", "Present the reader with a decision.", 1],
      ["dialogue", "Dialogue", "Give a character something to say.", 1],
      ["backdrop", "Backdrop", "Change the location in the background.", 2],
      ["portrait", "Portrait", "Show a character or expression.", 2],
      ["sound", "Sound", "Play a sound effect.", 2],
      ["music", "Music", "Play background music.", 2],
    ]);
    expect(rows.every((button) => !button.hasAttribute("aria-disabled"))).toBe(
      true,
    );
    expect(panel()!.textContent).not.toContain("Add a scene or move into one");
  });

  it("disables the story blocks outside a scene and says why", async () => {
    calls.context = { inScene: false };
    await mount();
    await setOpen(true);
    const disabled = Array.from(
      panel()!.querySelectorAll<HTMLButtonElement>("[data-add-construct]"),
    )
      .filter((button) => button.getAttribute("aria-disabled") === "true")
      .map((button) => button.dataset["addConstruct"]);
    expect(disabled).toEqual([
      "branch",
      "choose",
      "dialogue",
      "backdrop",
      "portrait",
      "sound",
      "music",
    ]);
    expect(panel()!.textContent).toContain(
      "Add a scene or move into one to use story blocks.",
    );
  });

  it("inserts the pressed construct in its script and closes", async () => {
    await mount();
    await setOpen(true);
    await act(async () => row("branch").click());
    await settle();
    expect(calls.inserted).toEqual([["main.sd", "branch"]]);
    expect(panel()).toBeNull();
  });

  it("closes on Escape and puts focus back in the script", async () => {
    await mount();
    await setOpen(true);
    await act(async () => {
      panel()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await settle();
    expect(calls.closed).toBe(1);
    expect(panel()).toBeNull();
    expect(calls.commands).toContainEqual(["main.sd", "focus"]);
  });

  it("closes from the Add button, now the close button, and puts focus back in the script", async () => {
    await mount();
    await act(async () => trigger()!.click());
    await settle();
    await act(async () => trigger()!.click());
    await settle(60);
    expect(calls.closed).toBe(1);
    expect(panel()).toBeNull();
    expect(calls.commands).toContainEqual(["main.sd", "focus"]);
  });

  it("keeps Add disabled while the script cannot be edited", async () => {
    await mount(false);
    expect(trigger()!.disabled).toBe(true);
  });
});

describe("the Add panel on a phone", () => {
  it("takes the keyboard's space with its heading over the toolbar", async () => {
    layout.value = "phone";
    workspace.layout.value = layout.value as Layout;
    await mount();
    expect(trigger()).toBeNull();
    await setOpen(true);
    expect(workspace.keyboardPanels.value).toEqual([{ heading: true }]);
    const dialog = panel()!;
    expect(dialog.hasAttribute("data-keyboard-panel")).toBe(true);
    expect(dialog.querySelector("h2")?.textContent).toBe("Add to script");
    expect(
      dialog.querySelector('header [aria-label="Close add menu"]'),
    ).not.toBeNull();
    await act(async () =>
      dialog
        .querySelector<HTMLButtonElement>('[aria-label="Close add menu"]')!
        .click(),
    );
    await settle();
    expect(panel()).toBeNull();
    expect(workspace.keyboardPanels.value).toEqual([]);
    expect(calls.commands).toContainEqual(["main.sd", "focus"]);
  });
});

const pickerPanel = (title: string) =>
  document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${title}"]`);
const cards = (title: string) =>
  Array.from(pickerPanel(title)!.querySelectorAll<HTMLElement>("[data-picker-item]"));
const button = (title: string, text: string) =>
  Array.from(pickerPanel(title)!.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === text || candidate.getAttribute("aria-label") === text,
  )!;
const openPicker = async (construct: string, title: string) => {
  await mount();
  await setOpen(true);
  await act(async () => row(construct).click());
  await settle();
  return pickerPanel(title)!;
};

describe("the pickers on desktop", () => {
  it("open from their row, headed by their kind with Back, listing each picture by its base name with its subfolder", async () => {
    const picker = await openPicker("backdrop", "Backdrop");
    expect(picker.querySelector("h2")?.textContent).toBe("Backdrop");
    expect(cards("Backdrop").map((card) => [card.dataset["pickerItem"], card.getAttribute("aria-label")])).toEqual([
      ["beach", "Preview beach"],
      ["plaza", "Preview plaza, city"],
    ]);
    expect(document.activeElement).toBe(cards("Backdrop")[0]);
    expect(picker.querySelector("[data-picker-status]")!.textContent).toBe("Select to preview");
    expect(button("Backdrop", "Use backdrop").disabled).toBe(true);
  });

  it("preview a pressed picture, then Use writes its name through the insert path and closes", async () => {
    await openPicker("backdrop", "Backdrop");
    await act(async () => cards("Backdrop")[1]!.click());
    await settle();
    expect(calls.auditions).toEqual(["show plaza"]);
    expect(cards("Backdrop")[1]!.getAttribute("aria-pressed")).toBe("true");
    expect(pickerPanel("Backdrop")!.querySelector("[data-picker-status]")!.textContent).toBe("Previewing");
    await act(async () => button("Backdrop", "Use backdrop").click());
    await settle();
    expect(calls.inserted).toEqual([["main.sd", "backdrop", "plaza"]]);
    expect(calls.auditions.slice(1, 2)).toEqual(["commit"]);
    expect(panel()).toBeNull();
    expect(pickerPanel("Backdrop")).toBeNull();
  });

  it("revert the preview when Back returns to the rows and when the panel closes", async () => {
    await openPicker("backdrop", "Backdrop");
    await act(async () => cards("Backdrop")[0]!.click());
    await act(async () => button("Backdrop", "Back to add options").click());
    await settle();
    expect(calls.auditions).toEqual(["show beach", "revert"]);
    expect(panel()!.querySelector('[data-add-construct="backdrop"]')).not.toBeNull();
    await act(async () => row("portrait").click());
    await settle();
    await act(async () => cards("Portrait")[0]!.click());
    await setOpen(false);
    expect(calls.auditions).toEqual(["show beach", "revert", "show imani", "revert"]);
  });

  it("offer a portrait by its base name and a sound with its length, playing a pressed sound", async () => {
    await openPicker("portrait", "Portrait");
    expect(cards("Portrait").map((card) => card.dataset["pickerItem"])).toEqual(["imani"]);
    await act(async () => button("Portrait", "Back to add options").click());
    await act(async () => row("sound").click());
    await settle();
    expect(cards("Sound").map((card) => card.getAttribute("aria-label"))).toEqual([
      "Preview door, 0:02",
      "Preview click, 1:05 · ui",
    ]);
    await act(async () => cards("Sound")[0]!.click());
    await settle();
    expect(calls.auditions).toEqual(["revert", "show blob:door"]);
    expect(pickerPanel("Sound")!.querySelector("[data-picker-status]")!.textContent).toBe("Playing");
  });

  it("say where the files go when the folder is empty, open Assets, or type a name instead", async () => {
    listAssets([]);
    const picker = await openPicker("music", "Music");
    expect(picker.querySelector("[data-picker-empty]")!.textContent).toContain(
      "No music yet.Sounds in a folder called Music are listed here.",
    );
    await act(async () => button("Music", "Open Assets").click());
    await settle();
    expect(calls.navigated).toEqual([
      ["setListState", { assetsType: "audio" }],
      ["navigateTo", "collection"],
    ]);
    expect(panel()).toBeNull();
    await setOpen(true);
    await act(async () => row("backdrop").click());
    await settle();
    expect(pickerPanel("Backdrop")!.textContent).toContain(
      "No backdrops yet.Pictures in a folder called Backdrops are listed here.",
    );
    await act(async () => button("Backdrop", "Type a name instead").click());
    await settle();
    expect(calls.inserted).toEqual([["main.sd", "backdrop"]]);
  });
});

describe("the pickers on a phone", () => {
  it("show a carousel with its position, where one tap inserts without a preview", async () => {
    layout.value = "phone";
    workspace.layout.value = layout.value as Layout;
    await mount();
    await setOpen(true);
    await act(async () => row("backdrop").click());
    await settle();
    const picker = pickerPanel("Backdrop")!;
    expect(picker.querySelector("h2")?.textContent).toBe("Backdrop");
    expect(picker.querySelector("[aria-live]")!.textContent).toContain("1 / 2");
    await act(async () => button("Backdrop", "Next backdrops").click());
    expect(picker.querySelector("[aria-live]")!.textContent).toContain("2 / 2");
    expect(cards("Backdrop")[1]!.getAttribute("aria-label")).toBe("Add plaza, city");
    await act(async () => cards("Backdrop")[1]!.click());
    await settle();
    expect(calls.inserted).toEqual([["main.sd", "backdrop", "plaza"]]);
    expect(calls.auditions.filter((entry) => entry.startsWith("show"))).toEqual([]);
  });

  it("link the Portrait picker to the thumbnail preference", async () => {
    layout.value = "phone";
    workspace.layout.value = layout.value as Layout;
    await mount();
    await setOpen(true);
    await act(async () => row("portrait").click());
    await settle();
    await act(async () => button("Portrait", "Portrait thumbnail preferences").click());
    await settle();
    expect(calls.navigated).toEqual([["navigateTo", "project", "add-folder-preferences"]]);
    expect(panel()).toBeNull();
  });
});

describe("the files a picker leaves out", () => {
  it("are counted under the list on desktop, with Open Assets", async () => {
    listAssets([...FILES, "assets/Sounds/with.wav", "assets/Sounds/door knock.wav"]);
    const picker = await openPicker("sound", "Sound");
    expect(cards("Sound").map((card) => card.dataset["pickerItem"])).toEqual(["door", "click"]);
    const line = picker.querySelector<HTMLElement>("[data-picker-left-out]")!;
    expect(line.textContent).toContain("2 sounds here have names a script can't use. Rename them in Assets.");
    expect(picker.querySelector("[data-picker-list]")!.nextElementSibling).toBe(line);
    expect(line.nextElementSibling?.tagName).toBe("FOOTER");
    await act(async () => line.querySelector("button")!.click());
    await settle();
    expect(calls.navigated).toEqual([
      ["setListState", { assetsType: "audio" }],
      ["navigateTo", "collection"],
    ]);
  });

  it("are counted under the carousel on a phone", async () => {
    layout.value = "phone";
    workspace.layout.value = layout.value as Layout;
    listAssets([...FILES, "assets/Backdrops/2nd.png"]);
    await mount();
    await setOpen(true);
    await act(async () => row("backdrop").click());
    await settle();
    const line = pickerPanel("Backdrop")!.querySelector<HTMLElement>("[data-picker-left-out]")!;
    expect(line.textContent).toContain("1 backdrop here has a name a script can't use. Rename it in Assets.");
    expect(line.previousElementSibling?.hasAttribute("data-carousel")).toBe(true);
  });

  it("are counted in place of the empty sentence when the picker offers none, and the folder line stays", async () => {
    listAssets(["assets/Music/with.wav", "assets/Music/after.wav"]);
    const picker = await openPicker("music", "Music");
    const empty = picker.querySelector<HTMLElement>("[data-picker-empty]")!;
    expect(empty.querySelector("[data-picker-empty-line]")!.textContent!.trim()).toBe(
      "2 pieces of music here have names a script can't use. Rename them in Assets.",
    );
    expect(empty.textContent).not.toContain("No music yet.");
    expect(empty.textContent).toContain("Sounds in a folder called Music are listed here.");
    expect(picker.querySelector("[data-picker-left-out]")).toBeNull();
  });
});

import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  commands: [] as [string, string][],
  inserted: [] as [string, string][],
  opened: 0,
  closed: 0,
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
        insertConstruct: async (filename: string, construct: string) => {
          calls.inserted.push([filename, construct]);
          screen(undefined);
          return true;
        },
        readNameAtCaret: async () => null,
        readEditorKeybindings: async () => null,
        closeWritingTools: () => {},
        openWritingTools: () => {},
      },
    },
  };
});

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
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

beforeEach(() => {
  calls.commands.length = 0;
  calls.inserted.length = 0;
  calls.opened = 0;
  calls.closed = 0;
  calls.context = { inScene: true };
  layout.value = "desktop";
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
  it("opens from Add as a popover headed Add to script, and Add becomes the close button", async () => {
    await mount();
    expect(trigger()!.textContent).toContain("Add");
    expect(trigger()!.getAttribute("aria-expanded")).toBe("false");
    await act(async () => trigger()!.click());
    await settle();
    expect(calls.opened).toBe(1);
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

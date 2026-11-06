import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  commands: [] as [string, string][],
  documents: [] as string[],
  name: null as unknown,
  keys: null as unknown,
}));
const layout = vi.hoisted(() => ({ value: "desktop", coarse: false }));

vi.mock("@impower/impower-ui/layout", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLayout: () => layout.value,
  useCoarsePointer: () => layout.coarse,
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", async () => {
  const { default: store } = await import(
    "../../src/modules/spark-editor/workspace/WorkspaceStore"
  );
  const screen = (writingTools: unknown) => {
    store.current = {
      ...store.current,
      screen: { ...store.current.screen, writingTools },
    } as typeof store.current;
  };
  return {
    Workspace: {
      window: {
        executeEditorCommand: (filename: string, command: string) => {
          calls.commands.push([filename, command]);
        },
        showDocument: async (uri: string) => {
          calls.documents.push(uri);
          return { success: true };
        },
        openWritingTools: (view = "menu") => screen({ view, fromMenu: false }),
        showWritingToolsView: (view: string) =>
          screen({ view, fromMenu: view !== "menu" }),
        closeWritingTools: () => screen(undefined),
        readNameAtCaret: async () => calls.name,
        readEditorKeybindings: async () => calls.keys,
      },
    },
  };
});

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: WriterBar } =
  await import("../../src/modules/spark-editor/components/writer-bar/WriterBar");
const { comboLabel } =
  await import("../../src/modules/spark-editor/components/writing-tools/shortcuts");

let host: HTMLDivElement | undefined;

const settle = (ms = 30) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const until = async (check: () => unknown, ms = 2000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) {
    await settle(20);
  }
};

const open = async () => {
  await act(async () => trigger().click());
  await until(() => panel());
  await settle(50);
};

const mount = async (canEdit = true) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(h(WriterBar, { filename: "main.sd", canEdit }), host!),
  );
};

const trigger = () =>
  document.querySelector<HTMLButtonElement>("[data-writing-tools-trigger]")!;

const panel = () => document.querySelector<HTMLElement>('[role="dialog"]');

const rows = () =>
  Array.from(
    panel()?.querySelectorAll<HTMLButtonElement>("[data-writing-tools-menu] button") ?? [],
  );

const row = (text: string) => rows().find((b) => b.textContent?.includes(text));



const key = (target: Element, name: string) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
    );
  });

const imani = {
  name: "IMANI",
  kind: "character",
  definition: { uri: "file://local/main.sd", range: { start: { line: 0, character: 7 }, end: { line: 0, character: 12 } } },
};

beforeEach(() => {
  calls.commands.length = 0;
  calls.documents.length = 0;
  calls.name = null;
  calls.keys = null;
  layout.value = "desktop";
  layout.coarse = false;
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: "local" },
    screen: {},
  };
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
});

describe("Writing tools menu", () => {
  it("shows the guide, the shortcuts and Find and replace, and no name tools off a name", async () => {
    await mount();
    await open();
    expect(panel()?.querySelector("h2")?.textContent).toBe("Writing tools");
    expect(rows().map((b) => b.textContent)).toEqual([
      "Sparkdown guideA quick reference while you write.",
      "Keyboard shortcutsFor a connected keyboard.",
      "Find and replace",
    ]);
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Close writing tools",
    );
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("shows the three name tools while the caret is on a name", async () => {
    calls.name = imani;
    await mount();
    await open();
    await until(() => row("Rename IMANI"));
    expect(row("Rename IMANI")?.textContent).toContain("Rename all uses and linked assets.");
    expect(row("Find references to IMANI")).toBeDefined();
    expect(row("Go to definition for IMANI")?.textContent).toContain("Show the character.");
    await act(async () => row("Find references to IMANI")!.click());
    await settle();
    await until(() => calls.commands.length);
    expect(calls.commands).toEqual([["main.sd", "references"]]);
    expect(workspace.current.screen.writingTools).toBeUndefined();
  });

  it("drops the previous name's tools while the next lookup is pending", async () => {
    calls.name = imani;
    await mount();
    await open();
    await until(() => row("Rename IMANI"));
    await act(async () =>
      panel()!.querySelector<HTMLButtonElement>('[aria-label="Close writing tools"]')!.click(),
    );
    await until(() => !panel());
    let resolve!: (value: unknown) => void;
    calls.name = new Promise((r) => (resolve = r));
    await open();
    expect(rows().map((b) => b.textContent)).toEqual([
      "Sparkdown guideA quick reference while you write.",
      "Keyboard shortcutsFor a connected keyboard.",
      "Find and replace",
    ]);
    await act(async () => resolve(null));
    await settle(50);
    expect(row("Rename IMANI")).toBeUndefined();
  });

  it("disables Rename while the script cannot be edited, and says so on a phone", async () => {
    calls.name = imani;
    layout.value = "phone";
    layout.coarse = true;
    await mount(false);
    await open();
    await until(() => row("Rename IMANI"));
    const rename = row("Rename IMANI")!;
    expect(rename.getAttribute("aria-disabled")).toBe("true");
    expect(rename.textContent).toContain("Tap Edit to rename.");
    await act(async () => rename.click());
    expect(calls.commands).toEqual([]);
    expect(row("Undo")?.getAttribute("aria-disabled")).toBe("true");
    expect(row("Select all")?.getAttribute("aria-disabled")).toBeNull();
  });

  it("goes to a picture's definition by showing its file", async () => {
    calls.name = { name: "sky", kind: "picture", definition: { uri: "file://local/sky.png", range: imani.definition.range } };
    await mount();
    await open();
    await until(() => row("Go to definition for sky"));
    expect(row("Go to definition for sky")?.textContent).toContain("Show all linked assets.");
    await act(async () => row("Go to definition for sky")!.click());
    await until(() => calls.documents.length);
    expect(calls.documents).toEqual(["file://local/sky.png"]);
    expect(calls.commands).toEqual([]);
  });

  it("lists every editor command row on a coarse pointer and runs each", async () => {
    layout.coarse = true;
    layout.value = "phone";
    await mount();
    await open();
    const labels = ["Find and replace", "Undo", "Redo", "Select all", "Select line", "Move line up", "Move line down", "Duplicate line", "Toggle comment"];
    for (const label of labels) {
      await until(() => row(label));
      await act(async () => row(label)!.click());
      await until(() => calls.commands.length === labels.indexOf(label) + 1);
      if (!workspace.current.screen.writingTools) {
        await settle(250);
        await open();
      }
    }
    expect(calls.commands.map(([, command]) => command)).toEqual([
      "search", "undo", "redo", "selectAll", "selectLine", "moveLineUp", "moveLineDown", "duplicateLine", "toggleComment",
    ]);
  });
});

describe("Writing tools views", () => {
  it("renders the guide from its Markdown file with a Back button", async () => {
    await mount();
    await open();
    await act(async () => row("Sparkdown guide")!.click());
    await until(() => panel()?.querySelector("[data-sparkdown-guide]"));
    await until(() => document.activeElement?.getAttribute("aria-label") === "Back to writing tools");
    const guide = panel()!.querySelector("[data-sparkdown-guide]")!;
    expect(panel()!.querySelector("h2")?.textContent).toBe("Sparkdown guide");
    expect(Array.from(guide.querySelectorAll("code")).map((c) => c.textContent)).toEqual([
      "scene the_rumour",
      "IMANI:",
      "[[imani:happy]]",
      "[[show backdrop sky_night]]",
      "choose",
      "+ [Your option]",
      "* [Your option]",
      "then … end",
    ]);
    expect(guide.querySelector("a")?.getAttribute("href")).toMatch(/sparkdown\/docs\/guide/);
    const back = panel()!.querySelector<HTMLButtonElement>('[aria-label="Back to writing tools"]')!;
    expect(document.activeElement).toBe(back);
    await act(async () => back.click());
    await until(() => panel()?.querySelector("h2")?.textContent === "Writing tools");
    expect(panel()!.querySelector("h2")?.textContent).toBe("Writing tools");
  });

  it("lists every command the editor reports, with None where it has no keys", async () => {
    calls.keys = {
      mac: false,
      commands: [
        { id: "search", label: "Find", group: "find", keys: ["Mod-f"] },
        { id: "gotoLine", label: "Go to line", group: "navigation", keys: ["Mod-g", "Mod-Alt-g"] },
        { id: "splitLine", label: "Split the line at the caret", group: "editing", keys: [] },
      ],
    };
    await mount();
    await open();
    await act(async () => row("Keyboard shortcuts")!.click());
    await until(() => panel()?.querySelector("[data-shortcuts-sheet]"));
    const sheet = panel()!.querySelector("[data-shortcuts-sheet]")!;
    const keysOf = (id: string) =>
      Array.from(sheet.querySelectorAll(`[data-shortcut="${id}"] kbd`)).map((k) => k.textContent);
    expect(keysOf("search")).toEqual(["Ctrl+F"]);
    expect(keysOf("gotoLine")).toEqual(["Ctrl+G", "Ctrl+Alt+G"]);
    expect(sheet.querySelector('[data-shortcut="splitLine"] dd')?.textContent).toBe("None");
    expect(Array.from(sheet.querySelectorAll("h3")).map((x) => x.textContent)).toEqual([
      "Editing", "Navigation", "Find", "App",
    ]);
  });

  it("writes combos for each platform", () => {
    expect(comboLabel("Mod-f", false)).toBe("Ctrl+F");
    expect(comboLabel("Mod-f", true)).toBe("Cmd+F");
    expect(comboLabel("Shift-Alt-ArrowUp", false)).toBe("Shift+Alt+Up");
    expect(comboLabel("Shift-Mod-k", true)).toBe("Cmd+Shift+K");
    expect(comboLabel("Alt-l", true)).toBe("Option+L");
  });
});

describe("Writing tools focus", () => {
  const field = () => {
    const input = document.body.appendChild(document.createElement("input"));
    input.setAttribute("aria-label", "Find");
    input.value = "Imani";
    input.focus();
    return input;
  };

  it("gives focus back to the field it opened over on Escape", async () => {
    await mount();
    const input = field();
    trigger().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    await open();
    expect(panel()!.contains(document.activeElement)).toBe(true);
    await key(document.activeElement!, "Escape");
    await until(() => !panel());
    await settle(50);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("Imani");
  });

  it("gives focus back on Close", async () => {
    await mount();
    const input = field();
    await open();
    const close = panel()!.querySelector<HTMLButtonElement>('[aria-label="Close writing tools"]')!;
    await act(async () => close.click());
    await until(() => !panel());
    await settle(50);
    expect(document.activeElement).toBe(input);
  });

  it("closes on a press outside the panel and the bar, leaving focus alone", async () => {
    await mount();
    const input = field();
    await open();
    const outside = document.body.appendChild(document.createElement("button"));
    await act(async () => {
      outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
      outside.click();
    });
    await until(() => !panel());
    await settle(50);
    expect(panel()).toBeNull();
    expect(document.activeElement).not.toBe(input);
  });

  it("keeps the field's focus when the trigger is tapped, and gives it back on Close", async () => {
    layout.value = "phone";
    layout.coarse = true;
    await mount();
    const input = field();
    const tap = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch" });
    trigger().dispatchEvent(tap);
    if (!tap.defaultPrevented) trigger().focus();
    expect(tap.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
    await open();
    const close = panel()!.querySelector<HTMLButtonElement>('[aria-label="Close writing tools"]')!;
    await act(async () => close.click());
    await until(() => !panel());
    await settle(50);
    expect(document.activeElement).toBe(input);
  });

  it("on a phone, gives focus back on Escape but not when the backdrop closes the sheet", async () => {
    layout.value = "phone";
    layout.coarse = true;
    await mount();
    const input = field();
    await open();
    expect(panel()!.contains(document.activeElement)).toBe(true);
    await key(document.activeElement!, "Escape");
    await until(() => !panel());
    await settle(50);
    expect(document.activeElement).toBe(input);

    await open();
    const backdrop = panel()!.parentElement!;
    await act(async () => {
      backdrop.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
      backdrop.click();
    });
    await until(() => !panel());
    await settle(50);
    expect(workspace.current.screen.writingTools).toBeUndefined();
    expect(document.activeElement).not.toBe(input);
  });

  it("stays open when the writer's bar is pressed", async () => {
    await mount();
    await open();
    const readout = document.querySelector<HTMLButtonElement>("[data-caret-position]")!;
    await act(async () => {
      readout.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
    });
    await settle(250);
    expect(panel()).not.toBeNull();
  });
});

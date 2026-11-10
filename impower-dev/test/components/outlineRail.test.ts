import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getDocumentSymbols } from "../../../packages/sparkdown-language-server/src/utils/providers/getDocumentSymbols";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Diagnostic } from "vscode-languageserver-protocol";

const intents = vi.hoisted(() => ({
  openOutlineLocation: vi.fn(),
  setOutlineSceneCollapsed: vi.fn(),
}));
const search = vi.hoisted(() => ({
  openFindFromSelection: vi.fn(),
  close: vi.fn(),
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { window: intents, search },
}));

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: Outline } =
  await import("../../src/modules/spark-editor/components/outline/Outline");
const { outlineRows } =
  await import("../../src/modules/spark-editor/components/outline/outlineRows");
const { ProblemsDialog } =
  await import("../../src/modules/spark-editor/components/problems");
const { default: problems } =
  await import("../../src/modules/spark-editor/workspace/problems/ProblemsStore");

const URI = "file://outline/main.sd";

const SCRIPT = `scene harbor
  The boat rocks.
  choose
    Where now?
    * Go ashore
      You step off.
  end
  branch storm
    Hold on.
  end
end
scene dock
  Done.
end
`;

const symbolsOf = (source: string) => {
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  documents.set({
    textDocument: {
      uri: URI,
      text: source,
      version: 1,
      languageId: "sparkdown",
    },
  });
  return getDocumentSymbols(
    documents.get(URI)!,
    documents.annotations(URI),
    documents.tree(URI),
  );
};

const problem = (line: number, severity: 1 | 2): Diagnostic => ({
  range: {
    start: { line, character: 4 },
    end: { line, character: 8 },
  },
  severity,
  message: severity === 1 ? "broken" : "suspicious",
});

const STORM_ERROR = problem(8, 1);
const DOCK_WARNING = problem(12, 2);

let host: HTMLDivElement | undefined;

const setCaret = (line: number) => {
  const state = workspace.current;
  const logic = state.panes.logic;
  workspace.current = {
    ...state,
    panes: {
      ...state.panes,
      logic: {
        ...logic,
        panel: "main",
        panels: {
          ...logic.panels,
          main: {
            ...logic.panels.main,
            activeEditor: {
              open: true,
              filename: "main.sd",
              selectedRange: {
                start: { line, character: 4 },
                end: { line, character: 4 },
              },
            },
          },
        },
      },
    },
  };
};

const setLayout = (collapsed: string[] | undefined) => {
  workspace.current = {
    ...workspace.current,
    outline: collapsed ? { collapsed: { [URI]: collapsed } } : {},
  };
};

const mount = async (diagnostics: Diagnostic[], source = SCRIPT, uri = URI) => {
  workspace.outline.value = {
    uri,
    symbols: symbolsOf(source),
    diagnostics,
    firstContentLine: 0,
  };
  host ??= document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(Outline, null), host!));
};

const rowButtons = () =>
  Array.from(
    host!.querySelectorAll<HTMLButtonElement>(
      '[role="listitem"] button[aria-label]',
    ),
  ).filter(
    (b) =>
      !b.hasAttribute("aria-expanded") && !b.hasAttribute("data-list-row-badge"),
  );

const row = (name: string) =>
  rowButtons().find((b) => b.getAttribute("aria-label")!.startsWith(name))!;

const badgeOf = (button: HTMLElement) =>
  button.parentElement!.querySelector<HTMLButtonElement>(
    "[data-list-row-badge]",
  );

const badge = (button: HTMLElement) => {
  const lead = badgeOf(button);
  if (!lead) {
    return button.querySelector("svg") ? "glyph" : "none";
  }
  return lead.querySelector('svg[class*="text-error"]')
    ? "error"
    : lead.querySelector('svg[class*="text-warning"]')
      ? "warning"
      : "none";
};

beforeEach(() => {
  Object.values(intents).forEach((fn) => fn.mockClear());
  setCaret(1);
  setLayout(undefined);
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  workspace.outline.value = null;
});

describe("the Outline rail", () => {
  it("lists scenes with their choice menus and branches nested beneath, named for a reader", async () => {
    await mount([]);
    expect(rowButtons().map((b) => b.getAttribute("aria-label"))).toEqual([
      "Scene: harbor",
      "Choose: Where now?",
      "Branch: storm",
      "Scene: dock",
    ]);
    expect(rowButtons().map((b) => b.textContent)).toEqual([
      "harbor",
      "Where now?",
      "storm",
      "dock",
    ]);
    expect(
      host!.querySelector('[role="list"]')!.getAttribute("aria-label"),
    ).toBe("Scene outline in main");
  });

  it("puts a problem's icon in place of the glyph: a scene's total, a branch's or menu's own", async () => {
    await mount([STORM_ERROR, DOCK_WARNING]);
    expect(
      rowButtons().map((b) => [b.getAttribute("aria-label"), badge(b)]),
    ).toEqual([
      ["Scene: harbor, 1 error in this scene", "error"],
      ["Choose: Where now?", "glyph"],
      ["Branch: storm, 1 error", "error"],
      ["Scene: dock, 1 warning in this scene", "warning"],
    ]);
    await mount([]);
    expect(rowButtons().map(badge)).toEqual([
      "glyph",
      "glyph",
      "glyph",
      "glyph",
    ]);
  });

  it("badges a menu for a problem on its own lines, and its scene for the total", async () => {
    await mount([problem(3, 2)]);
    expect(
      rowButtons().map((b) => [b.getAttribute("aria-label"), badge(b)]),
    ).toEqual([
      ["Scene: harbor, 1 warning in this scene", "warning"],
      ["Choose: Where now?, 1 warning", "warning"],
      ["Branch: storm", "glyph"],
      ["Scene: dock", "glyph"],
    ]);
  });

  it("marks the caret's row as the current location and its scene as containing it", async () => {
    setCaret(8);
    await mount([]);
    expect(row("Branch: storm").getAttribute("aria-current")).toBe("location");
    expect(row("Scene: harbor").hasAttribute("aria-current")).toBe(false);
    expect(
      row("Scene: harbor").parentElement!.className.split(/\s+/),
    ).toContain("text-accent");
    expect(
      row("Scene: dock").parentElement!.className.split(/\s+/),
    ).not.toContain("text-accent");
    expect(row("Scene: dock").parentElement!.className.split(/\s+/)).toContain(
      "text-muted",
    );
    expect(
      row("Branch: storm").parentElement!.className.split(/\s+/),
    ).not.toContain("text-muted");
    expect(
      row("Scene: harbor").parentElement!.className.split(/\s+/),
    ).not.toContain("text-muted");
    setCaret(12);
    await act(async () => {});
    expect(row("Scene: dock").getAttribute("aria-current")).toBe("location");
    expect(row("Branch: storm").hasAttribute("aria-current")).toBe(false);
  });

  it("opens the script at a row's symbol", async () => {
    await mount([]);
    await act(async () => row("Branch: storm").click());
    await vi.waitFor(() =>
      expect(intents.openOutlineLocation).toHaveBeenCalledWith(URI, {
        start: { line: 7, character: 0 },
        end: { line: 7, character: 14 },
      }),
    );
  });

  it("collapses a scene through the per-project layout state, and a collapsed scene holds the caret for its rows", async () => {
    setCaret(8);
    await mount([]);
    const toggle = host!.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse scene harbor"]',
    )!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await act(async () => toggle.click());
    await vi.waitFor(() =>
      expect(intents.setOutlineSceneCollapsed).toHaveBeenCalledWith(
        URI,
        "harbor#0",
        true,
      ),
    );
    setLayout(["harbor#0"]);
    await act(async () => {});
    expect(rowButtons().map((b) => b.textContent)).toEqual(["harbor", "dock"]);
    expect(row("Scene: harbor").getAttribute("aria-current")).toBe("location");
    expect(
      host!
        .querySelector('button[aria-label="Expand scene harbor"]')!
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("swaps the outline for the search view and back", async () => {
    await mount([]);
    await act(async () =>
      host!
        .querySelector<HTMLButtonElement>('button[aria-label="Search"]')!
        .click(),
    );
    await vi.waitFor(() =>
      expect(search.openFindFromSelection).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      workspace.search.value = {
        ...workspace.search.value,
        open: true,
        view: "find",
      };
    });
    expect(host!.querySelector("h2")!.textContent).toBe("Search");
    expect(host!.querySelector('[role="listitem"]')).toBeNull();
    await act(async () => {
      workspace.search.value = { ...workspace.search.value, open: false };
    });
    expect(host!.querySelector("h2")?.textContent).not.toBe("Search");
    expect(host!.querySelector('[role="listitem"]')).not.toBeNull();
  });

  it("invites a writer to add scenes when the script has none", async () => {
    await mount([], "Just some lines.\n");
    expect(host!.textContent).toContain(
      "Scenes will appear here as you write them.",
    );
    expect(host!.querySelector('[role="listitem"]')).toBeNull();
  });

  it("names a script whose filename holds a percent sign as it is written", async () => {
    await mount([STORM_ERROR], SCRIPT, "file://outline/100%.sd");
    expect(
      host!.querySelector('[role="list"]')!.getAttribute("aria-label"),
    ).toBe("Scene outline in 100%");
    await mount([], SCRIPT, "file://outline/chapter%20one.sd");
    expect(
      host!.querySelector('[role="list"]')!.getAttribute("aria-label"),
    ).toBe("Scene outline in chapter%20one");
  });

  it("reveals the current row again when another script opens with its current row at the same index", async () => {
    const many = Array.from(
      { length: 60 },
      (_, i) => `scene s${i}\n  Line ${i}.\nend\n`,
    ).join("");
    const viewport = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(440);
    try {
      setCaret(150);
      await mount([], many, "file://outline/main.sd");
      const scroller = () =>
        host!.querySelector('[role="list"]')!.parentElement as HTMLElement;
      expect(scroller().scrollTop).toBeGreaterThan(0);
      scroller().scrollTop = 0;
      await mount([], many, "file://outline/copy/main.sd");
      expect(scroller().scrollTop).toBeGreaterThan(0);
    } finally {
      viewport.mockRestore();
    }
  });
});

describe("an Outline badge", () => {
  const dialog = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).find(
      (d) => d.textContent!.includes("Problems to fix"),
    );
  const context = () => dialog()!.querySelector("p")!.textContent;
  const titles = () =>
    Array.from(dialog()!.querySelectorAll("[data-message-entry] strong")).map(
      (s) => s.textContent,
    );

  const mountWithDialog = async (diagnostics: Diagnostic[], source = SCRIPT) => {
    await mount(diagnostics, source);
    const dialogHost = document.body.appendChild(document.createElement("div"));
    await act(async () => render(h(ProblemsDialog, null), dialogHost));
    return dialogHost;
  };

  afterEach(async () => {
    await act(async () => problems.closeDialog());
    await new Promise((resolve) => setTimeout(resolve, 250));
  });

  it("opens Problems to fix for a scene's total, naming the scene, and returns focus to the badge", async () => {
    const note: Diagnostic = { ...problem(1, 1), severity: 3, message: "To do: rock harder" };
    const dialogHost = await mountWithDialog([STORM_ERROR, note, DOCK_WARNING]);
    const harbor = badgeOf(row("Scene: harbor"))!;
    expect(harbor.getAttribute("aria-label")).toBe(
      "Scene total: 1 error, 1 note in harbor",
    );
    expect(harbor.getAttribute("aria-haspopup")).toBe("dialog");
    harbor.focus();
    await act(async () => harbor.click());
    expect(context()).toBe("harbor · 1 error, 1 note");
    expect(titles()).toEqual(["Note · To do: rock harder", "Error · broken"]);
    const close = dialog()!.querySelector<HTMLButtonElement>(
      '[aria-label="Close dialog"]',
    )!;
    await act(async () => close.click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(dialog()).toBeUndefined();
    expect(document.activeElement).toBe(harbor);
    await act(async () => render(null, dialogHost));
    dialogHost.remove();
  });

  it("scopes a branch's badge to its own lines", async () => {
    const dialogHost = await mountWithDialog([STORM_ERROR, problem(1, 2)]);
    await act(async () => badgeOf(row("Branch: storm"))!.click());
    expect(context()).toBe("storm · 1 error");
    expect(titles()).toEqual(["Error · broken"]);
    await act(async () => render(null, dialogHost));
    dialogHost.remove();
  });

  it("opens Script setup's problems from its row, notes included", async () => {
    const note: Diagnostic = { ...problem(0, 1), severity: 3, message: "To do: tidy" };
    const dialogHost = await mountWithDialog([note], `VAR = 1\n${SCRIPT}`);
    const setup = row("Script setup");
    expect(badgeOf(setup)).toBeNull();
    expect(setup.getAttribute("aria-haspopup")).toBe("dialog");
    await act(async () => setup.click());
    expect(context()).toBe("Script setup · 1 note");
    expect(intents.openOutlineLocation).not.toHaveBeenCalled();
    await act(async () => render(null, dialogHost));
    dialogHost.remove();
  });
});

describe("outline rows", () => {
  it("carries the problems each row counts: a scene's total, a branch's own and the setup lines'", () => {
    const setupNote: Diagnostic = { ...problem(0, 1), severity: 3, message: "note" };
    const { rows } = outlineRows({
      symbols: symbolsOf(`VAR = 1\n${SCRIPT}`),
      diagnostics: [setupNote, problem(9, 1), problem(4, 2)],
      firstContentLine: 0,
    });
    expect(
      rows.map((r) => [r.label, r.diagnostics.map((d) => d.range.start.line)]),
    ).toEqual([
      ["Script setup", [0]],
      ["harbor", [9, 4]],
      ["Where now?", [4]],
      ["storm", [9]],
      ["dock", []],
    ]);
  });

  it("opens with Script setup when lines precede the first scene, counting the problems there", () => {
    const source = `VAR = 1\n${SCRIPT}`;
    const { rows } = outlineRows({
      symbols: symbolsOf(source),
      diagnostics: [problem(0, 2)],
      firstContentLine: 0,
    });
    expect(rows[0]).toMatchObject({
      kind: "setup",
      accessibleName: "Script setup, 1 warning",
      selection: { start: { line: 0, character: 0 } },
    });
    expect(rows[1]!.accessibleName).toBe("Scene: harbor");
    expect(
      outlineRows({
        symbols: symbolsOf(SCRIPT),
        diagnostics: [],
        firstContentLine: 0,
      }).rows[0]!.kind,
    ).toBe("scene");
  });

  it("makes Script setup the current row while the caret is before the first scene", () => {
    const symbols = symbolsOf(`VAR = 1\n${SCRIPT}`);
    const before = outlineRows({
      symbols,
      diagnostics: [],
      caret: { line: 0, character: 3 },
      firstContentLine: 0,
    });
    expect(before.currentIndex).toBe(0);
    expect(before.rows.map((r) => r.current)).toEqual([
      "self",
      "none",
      "none",
      "none",
      "none",
    ]);
    const inside = outlineRows({
      symbols,
      diagnostics: [],
      caret: { line: 2, character: 3 },
      firstContentLine: 0,
    });
    expect(inside.currentIndex).toBe(1);
    expect(inside.rows[0]!.current).toBe("none");
  });
});

import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getDocumentSymbols } from "../../../packages/sparkdown-language-server/src/utils/providers/getDocumentSymbols";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Diagnostic } from "vscode-languageserver-protocol";

const intents = vi.hoisted(() => ({
  openOutlineLocation: vi.fn(),
  setOutlineSceneCollapsed: vi.fn(),
  setOutlineSearch: vi.fn(),
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { window: intents },
}));

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: Outline } =
  await import("../../src/modules/spark-editor/components/outline/Outline");
const { outlineRows } =
  await import("../../src/modules/spark-editor/components/outline/outlineRows");

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

const setLayout = (collapsed: string[] | undefined, search = false) => {
  workspace.current = {
    ...workspace.current,
    outline: collapsed ? { collapsed: { [URI]: collapsed } } : {},
    screen: { ...workspace.current.screen, outlineSearch: search },
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
  ).filter((b) => !b.hasAttribute("aria-expanded"));

const row = (name: string) =>
  rowButtons().find((b) => b.getAttribute("aria-label")!.startsWith(name))!;

const badge = (button: HTMLElement) =>
  button.querySelector('svg[class*="text-error"]')
    ? "error"
    : button.querySelector('svg[class*="text-warning"]')
      ? "warning"
      : "glyph";

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
      expect(intents.setOutlineSearch).toHaveBeenCalledWith(true),
    );
    setLayout(undefined, true);
    await act(async () => {});
    expect(host!.querySelector("h2")!.textContent).toBe("Search");
    expect(host!.querySelector('[role="listitem"]')).toBeNull();
    await act(async () =>
      host!
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Back to outline"]',
        )!
        .click(),
    );
    await vi.waitFor(() =>
      expect(intents.setOutlineSearch).toHaveBeenCalledWith(false),
    );
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

describe("outline rows", () => {
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

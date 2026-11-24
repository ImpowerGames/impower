import { h } from "preact";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { atDesktop, inChromium, installBrowserStubs, markupOf, THEMES } from "./geometryHarness";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { search: {} },
}));

beforeAll(installBrowserStubs);

const ui = await import("@impower/impower-ui/components");
const { SearchRail } = await import("../../src/modules/spark-editor/components/find-references-rename");
const { ToolPanel, ToolPanelRoot } = await import("../../src/modules/spark-editor/components/tool-panel");
const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { RAIL_COMPACT_WIDTH } = await import("../../src/modules/spark-editor/workspace/railWidths");
const { INITIAL_SEARCH, INITIAL_SEARCH_POSITION } = await import(
  "../../src/modules/spark-editor/workspace/searchState"
);

const MAIN = "file:///p/main.sd";
const range = (line: number, from: number, to: number) => ({
  start: { line, character: from },
  end: { line, character: to },
});

const findRail = async () => {
  workspace.search.value = {
    ...INITIAL_SEARCH,
    open: true,
    view: "find" as const,
    term: "rumour",
    total: 2,
    groups: [
      {
        uri: MAIN,
        uses: [
          { uri: MAIN, range: range(1, 6, 12), lineText: "  The rumour spread." },
          { uri: MAIN, range: range(3, 2, 8), lineText: "  A rumour again." },
        ],
      },
    ],
  };
  workspace.searchPosition.value = INITIAL_SEARCH_POSITION;
  try {
    return await markupOf(h("div", { style: "width: 260px" }, h(SearchRail, {})));
  } finally {
    workspace.search.value = INITIAL_SEARCH;
  }
};

const measureFind = () => {
  const rail = document.querySelector('section[data-view="find"]')!;
  const size = (el: Element) => {
    const box = el.getBoundingClientRect();
    return `${box.width}x${box.height}`;
  };
  const rows = [...rail.querySelectorAll<HTMLElement>("ul > li")];
  const ownsEdges = (li: HTMLElement) => {
    const box = li.getBoundingClientRect();
    const x = box.x + box.width / 2;
    return [box.top + 2, box.bottom - 2].every((y) => document.elementFromPoint(x, y)?.closest("li") === li);
  };
  return {
    buttons: [...new Set([...rail.querySelectorAll("form button")].map(size))],
    rows: [...new Set(rows.map((li) => li.getBoundingClientRect().height))],
    rowButtons: [...new Set(rows.map((li) => li.querySelector("button")!.getBoundingClientRect().height))],
    rowsOwnTheirEdges: rows.every(ownsEdges),
  };
};

describe("Story page details from the review (I-2716)", () => {
  it("sizes the rail's Find buttons 32px and its result rows 34px with a mouse", async () => {
    const markup = await findRail();
    expect(await inChromium(markup, { width: 1440 }, measureFind)).toEqual({
      buttons: ["32x32"],
      rows: [34],
      rowButtons: [34],
      rowsOwnTheirEdges: true,
    });
  });

  it("keeps the rail's Find buttons and result rows at 44px under a coarse pointer", async () => {
    const markup = await findRail();
    expect(await inChromium(markup, { width: 1440, touch: true }, measureFind)).toEqual({
      buttons: ["44x44"],
      rows: [44],
      rowButtons: [44],
      rowsOwnTheirEdges: true,
    });
  });

  it.each(THEMES)("marks a match with the declared-name tint the prototype uses in %s", async (theme) => {
    const markup = await findRail();
    const percent = theme === "chalk" ? 16 : 26;
    const measured = await inChromium(
      markup,
      { width: 1440, theme },
      (share: number) => {
        const sample = document.body.appendChild(document.createElement("span"));
        sample.style.background = `color-mix(in srgb, var(--syntax-section-name-definition) ${share}%, transparent)`;
        return {
          mark: getComputedStyle(document.querySelector("mark")!).backgroundColor,
          expected: getComputedStyle(sample).backgroundColor,
        };
      },
      percent,
    );
    expect(measured.mark).toBe(measured.expected);
  });

  it("lets a tool panel's caller choose its popover width and keeps the shared 360px otherwise", async () => {
    const panel = (width?: number) =>
      atDesktop(() =>
        markupOf(
          h(
            ToolPanelRoot,
            { open: true, onOpen: () => {}, onClose: () => {} },
            h(ui.PopoverAnchor, {}, h("button", { type: "button" }, "Open")),
            h(ToolPanel, { open: true, title: "Panel", width, onClose: () => {} }, h("p", {}, "Body")),
          ),
        ),
      );
    const widthOf = () => document.querySelector<HTMLElement>("[data-tool-panel]")!.offsetWidth;
    expect(await inChromium(await panel(340), { width: 1440 }, widthOf)).toBe(340);
    expect(await inChromium(await panel(), { width: 1440 }, widthOf)).toBe(360);
  });

  it("leaves no room for the 190px rail beside the script and preview at 768, and keeps it at 1100", () => {
    const room = (width: number) => width - RAIL_COMPACT_WIDTH.reserve;
    expect(room(768)).toBeLessThan(RAIL_COMPACT_WIDTH.full);
    expect(room(1100)).toBeGreaterThanOrEqual(RAIL_COMPACT_WIDTH.full);
  });

  it.each(THEMES)("fills a paper thumbnail with the theme's paper in %s, as the prototype's sound tiles", async (theme) => {
    const markup = await markupOf(h(ui.Thumbnail, { size: "card", surface: "paper", glyph: h("svg", {}) }));
    const measured = await inChromium(markup, { width: 1440, theme }, () => {
      const sample = document.body.appendChild(document.createElement("span"));
      sample.style.background = "var(--paper)";
      return {
        fill: getComputedStyle(document.querySelector("[data-thumbnail]")!).backgroundColor,
        paper: getComputedStyle(sample).backgroundColor,
      };
    });
    expect(measured.fill).toBe(measured.paper);
    expect(measured.paper).toBe(theme === "chalk" ? "rgb(250, 250, 250)" : "rgb(35, 36, 39)");
  });
});

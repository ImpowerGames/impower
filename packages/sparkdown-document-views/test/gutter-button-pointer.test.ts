// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildGutterMarksPage } from "./harness/gutter-marks.mjs";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Mark {
  kind: string;
  label: string | null;
  box: Box;
  glyph: Box;
  painted: [number, number];
  column: Box;
  textLeft: number;
  lineCentre: number;
}

let browser: Browser;
let pageUrl: string;
let outDir: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "gutter-marks-"));
  pageUrl = await buildGutterMarksPage(outDir);
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  rmSync(outDir, { recursive: true, force: true });
});

const open = async (coarse: boolean): Promise<Page> => {
  const context = await browser.newContext({
    viewport: { width: 430, height: 600 },
    hasTouch: coarse,
    isMobile: coarse,
  });
  const page = await context.newPage();
  await page.goto(pageUrl);
  await page.waitForFunction(() => "gutterMarks" in window);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page;
};

const marks = (page: Page): Promise<Mark[]> =>
  page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const kinds = ["cm-choice-marker", "cm-breakpoint", "cm-fold-marker"];
    return [...document.querySelectorAll(kinds.map((k) => `.${k}`).join(","))]
      .filter((el) => (el as HTMLElement).offsetParent !== null && !el.closest("[style*='visibility']"))
      .map((el) => {
        const glyph = el.querySelector(".cm-gutter-button-glyph") ?? el;
        const lineAt = (el as HTMLElement).dataset["line"];
        const view = (window as unknown as { gutterMarks: { view: { lineBlockAt(pos: number): { top: number; height: number }; state: { doc: { line(n: number): { from: number } } }; documentTop: number } } }).gutterMarks.view;
        const block = lineAt ? view.lineBlockAt(view.state.doc.line(Number(lineAt)).from) : null;
        return {
          kind: kinds.find((k) => el.classList.contains(k))!,
          label: el.getAttribute("aria-label"),
          box: box(el),
          glyph: box(glyph),
          painted: (() => { const b = getComputedStyle(glyph, "::before"); return [parseFloat(b.width) || 0, parseFloat(b.height) || 0] as [number, number]; })(),
          column: box(el.closest(".cm-gutter") ?? el),
          textLeft: document.querySelector(".cm-content")!.getBoundingClientRect().left,
          lineCentre: block ? view.documentTop + block.top + block.height / 2 : NaN,
        };
      });
  });

const setPinned = (page: Page, pinned: boolean) =>
  page.evaluate(async (value) => {
    (window as unknown as { gutterMarks: { setPinned(p: boolean): void } }).gutterMarks.setPinned(value);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, pinned);

describe.each([
  ["a fine pointer", false, 16],
  ["a coarse pointer", true, 44],
])("every gutter mark under %s", (_label, coarse, target) => {
  it("draws its glyph at 16 by 16 inside a target of the pointer's size", async () => {
    const page = await open(coarse);
    const found = await marks(page);
    expect(new Set(found.map((m) => m.kind))).toEqual(
      new Set(["cm-choice-marker", "cm-breakpoint", "cm-fold-marker"]),
    );
    for (const mark of found) {
      expect([mark.kind, mark.glyph.width, mark.glyph.height]).toEqual([mark.kind, 16, 16]);
      expect([mark.kind, ...mark.painted]).toEqual([mark.kind, 16, 16]);
      expect([mark.kind, mark.box.width, mark.box.height]).toEqual([mark.kind, target, target]);
      expect([mark.kind, mark.glyph.left + 8]).toEqual([mark.kind, expect.closeTo(mark.column.left + mark.column.width / 2, 1)]);
      expect([mark.kind, mark.box.left + mark.box.width <= mark.textLeft]).toEqual([mark.kind, true]);
      expect(mark.glyph.top + 8).toBeCloseTo(mark.box.top + mark.box.height / 2, 1);
    }
    await page.context().close();
  });

  it("centres a choice marker's glyph on its line and keeps its box when pinned and unpinned", async () => {
    const page = await open(coarse);
    const choice = async () => (await marks(page)).find((m) => m.kind === "cm-choice-marker" && m.label?.endsWith("line 5"))!;
    const auto = await choice();
    expect(auto.label).toBe("Choice the preview made on line 5");
    expect(auto.glyph.top + 8).toBeCloseTo(auto.lineCentre, 0);
    await setPinned(page, true);
    const pinned = await choice();
    expect(pinned.label).toBe("Pinned choice on line 5");
    expect(pinned.box).toEqual(auto.box);
    expect(pinned.glyph).toEqual(auto.glyph);
    await setPinned(page, false);
    expect((await choice()).box).toEqual(auto.box);
    await page.context().close();
  });
});

const lineCentre = (page: Page, line: number) =>
  page.evaluate((n) => {
    const view = (window as unknown as { gutterMarks: { view: { lineBlockAt(pos: number): { top: number; height: number }; state: { doc: { line(n: number): { from: number } } }; documentTop: number } } }).gutterMarks.view;
    const block = view.lineBlockAt(view.state.doc.line(n).from);
    return view.documentTop + block.top + block.height / 2;
  }, line);

describe.each([
  ["a fine pointer", false],
  ["a coarse pointer", true],
])("the mark column under %s", (_label, coarse) => {
  it("draws one mark on a line that holds a breakpoint and a choice: the breakpoint", async () => {
    const page = await open(coarse);
    const found = await marks(page);
    const y = await lineCentre(page, 3);
    const onLine3 = found.filter((m) => m.box.top <= y && m.box.top + m.box.height >= y && m.kind !== "cm-fold-marker");
    expect(onLine3.map((m) => m.kind)).toEqual(["cm-breakpoint"]);
    expect(found.some((m) => m.label === "Choice the preview made on line 3")).toBe(false);
    await page.context().close();
  });
});

describe("a press where a fold marker's touch target reaches into the breakpoint column", () => {
  it("goes to the breakpoint column, whether or not the line holds a breakpoint", async () => {
    const page = await open(true);
    const hits = await page.evaluate(async () => {
      const column = document.querySelector(".cm-breakpoint-gutter")!.getBoundingClientRect();
      const view = (window as unknown as { gutterMarks: { view: { lineBlockAt(pos: number): { top: number; height: number }; state: { doc: { line(n: number): { from: number } } }; documentTop: number } } }).gutterMarks.view;
      const at = (n: number) => {
        const block = view.lineBlockAt(view.state.doc.line(n).from);
        const target = document.elementFromPoint(column.right - 2, view.documentTop + block.top + block.height / 2);
        return target?.closest(".cm-fold-marker") ? "fold" : target?.closest(".cm-breakpoint-gutter") ? "breakpoint column" : target?.className;
      };
      const reach = [...document.querySelectorAll(".cm-fold-marker")].some((fold) => fold.getBoundingClientRect().left < column.right - 2);
      return { reach, line2: at(2), line3: at(3) };
    });
    expect(hits).toEqual({ reach: true, line2: "breakpoint column", line3: "breakpoint column" });
    await page.context().close();
  });
});

describe("the gutter marks and route pins under forced colours", () => {
  it("draw every masked glyph at 16 by 16 in CanvasText, so none turns into Canvas on Canvas or into nothing", async () => {
    const context = await browser.newContext({ viewport: { width: 430, height: 600 }, forcedColors: "active" });
    const page = await context.newPage();
    await page.goto(pageUrl);
    await page.waitForFunction(() => "gutterMarks" in window);
    await page.evaluate(async () => {
      (window as unknown as { gutterMarks: { openChoice(line: number): void } }).gutterMarks.openChoice(5);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    const paints = await page.evaluate(() => {
      const probe = document.body.appendChild(document.createElement("span"));
      probe.style.color = "CanvasText";
      const canvasText = getComputedStyle(probe).color;
      const drawn = (kind: string, element: Element, paint: string) => {
        const box = element.getBoundingClientRect();
        return {
          kind,
          paint,
          size: [Math.round(box.width), Math.round(box.height)],
          shown: element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
        };
      };
      const glyphs = [...document.querySelectorAll(".cm-breakpoint, .cm-choice-marker")].map((mark) => {
        const glyph = mark.querySelector(".cm-gutter-button-glyph")!;
        const before = getComputedStyle(glyph, "::before");
        const paint = before.display === "none" || before.content === "none" ? "no ::before" : before.backgroundColor;
        return drawn(mark.className.replace("cm-gutter-button ", ""), glyph, paint);
      });
      const masks = [...document.querySelectorAll(".route-icon-mask, .cm-choice-popover .cm-choice-icon")].map((icon) => {
        const name = icon.classList.contains("route-icon-mask") ? `route ${(icon as HTMLElement).dataset["icon"]}` : icon.className;
        return drawn(name, icon, getComputedStyle(icon).backgroundColor);
      });
      const folds = [...document.querySelectorAll(".cm-fold-marker")].map((mark) =>
        getComputedStyle(mark.querySelector(".cm-gutter-button-glyph")!, "::before").backgroundColor,
      );
      return { canvasText, marks: [...glyphs, ...masks], folds };
    });
    const kinds = paints.marks.map((mark) => mark.kind);
    expect(kinds).toContain("route auto");
    expect(kinds).toContain("route pinned");
    expect(kinds.some((kind) => kind.includes("cm-choice-icon-auto"))).toBe(true);
    expect(kinds.some((kind) => kind.includes("cm-breakpoint"))).toBe(true);
    for (const mark of paints.marks) {
      expect(mark).toEqual({ kind: mark.kind, paint: paints.canvasText, size: [16, 16], shown: true });
    }
    expect(paints.folds.length).toBeGreaterThan(0);
    for (const paint of paints.folds) {
      expect(paint).toBe(paints.canvasText);
    }
    await context.close();
  });
});

interface Harness {
  gutterMarks: {
    view: { lineBlockAt(pos: number): { top: number; height: number }; state: { doc: { line(n: number): { from: number } } }; documentTop: number };
    setLineNumbers(on: boolean): void;
    setBreakpoints(lines: number[]): void;
    setChoices(choices: { line: number; pinned: boolean }[]): void;
    setCaret(line: number): void;
    fold(line: number): void;
  };
}

interface Columns {
  editorLeft: number;
  mark: [number, number];
  numbers: [number, number] | null;
  fold: [number, number];
  textLeft: number;
}

const openGutter = async (width: number, coarse: boolean): Promise<Page> => {
  const context = await browser.newContext({
    viewport: { width, height: 700 },
    hasTouch: coarse,
    isMobile: coarse,
  });
  const page = await context.newPage();
  await page.goto(pageUrl);
  await page.waitForFunction(() => "gutterMarks" in window);
  await page.addStyleTag({ content: "section { width: auto; }" });
  await act(page, (h) => {
    h.setLineNumbers(false);
    h.setBreakpoints([]);
    h.setChoices([]);
  });
  return page;
};

const act = (page: Page, run: (h: Harness["gutterMarks"]) => void) =>
  page.evaluate(async (source) => {
    const harness = (window as unknown as Harness).gutterMarks;
    new Function("h", `(${source})(h)`)(harness);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, run.toString());

const columns = (page: Page): Promise<Columns> =>
  page.evaluate(() => {
    const span = (selector: string): [number, number] | null => {
      const el = document.querySelector(selector);
      if (!el || getComputedStyle(el).display === "none") {
        return null;
      }
      const r = el.getBoundingClientRect();
      return [r.left, r.right];
    };
    return {
      editorLeft: document.querySelector(".cm-editor")!.getBoundingClientRect().left,
      mark: span(".cm-breakpoint-gutter")!,
      numbers: span(".cm-lineNumbers"),
      fold: span(".cm-foldGutter")!,
      textLeft: document.querySelector(".cm-content")!.getBoundingClientRect().left,
    };
  });

const tapsAcross = (page: Page, line: number): Promise<string> =>
  page.evaluate((n) => {
    const view = (window as unknown as Harness).gutterMarks.view;
    const block = view.lineBlockAt(view.state.doc.line(n).from);
    const y = view.documentTop + block.top + block.height / 2;
    const left = document.querySelector(".cm-editor")!.getBoundingClientRect().left;
    const kind = (el: Element | null) =>
      !el ? "nothing"
      : el.closest(".cm-choice-marker") ? "choice"
      : el.closest(".cm-breakpoint") ? "breakpoint"
      : el.closest(".cm-fold-marker") ? "fold arrow"
      : el.closest(".cm-breakpoint-gutter") ? "mark column"
      : el.closest(".cm-foldGutter") ? "fold column"
      : el.closest(".cm-content") ? "text"
      : el.closest(".cm-gutters") ? "gutter"
      : "outside";
    const runs: string[] = [];
    let last = "";
    for (let x = 0; x < 80; x += 1) {
      const k = kind(document.elementFromPoint(left + x + 0.5, y));
      if (k !== last) {
        runs.push(`${k}@${x}`);
        last = k;
      }
    }
    return runs.join(" ");
  }, line);

const targets = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".cm-choice-marker, .cm-breakpoint, .cm-fold-marker")]
      .filter((el) => getComputedStyle(el).opacity !== "0")
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { kind: el.classList.contains("cm-fold-marker") ? "fold" : "mark", size: [r.width, r.height] };
      }),
  );

describe.each([430, 360])("the touch gutter with line numbers off at %i wide", (width) => {
  it("keeps the text's left edge where it is when a route or a breakpoint appears and goes", async () => {
    const page = await openGutter(width, true);
    const before = await columns(page);
    expect(before.numbers).toBeNull();
    expect(before.mark).toEqual([before.editorLeft, before.editorLeft + 44]);
    expect(before.fold).toEqual([before.mark[1], before.mark[1] + 16]);
    expect(before.textLeft).toBe(before.fold[1]);
    const edges = [before.textLeft];
    await act(page, (h) => h.setChoices([{ line: 5, pinned: false }]));
    edges.push((await columns(page)).textLeft);
    await act(page, (h) => h.setChoices([{ line: 5, pinned: true }]));
    edges.push((await columns(page)).textLeft);
    await act(page, (h) => h.setBreakpoints([3]));
    edges.push((await columns(page)).textLeft);
    await act(page, (h) => {
      h.setBreakpoints([]);
      h.setChoices([]);
    });
    edges.push((await columns(page)).textLeft);
    expect(edges).toEqual(edges.map(() => before.textLeft));
    await page.context().close();
  });

  it("moves the text by the line numbers' width and nothing else when line numbers are turned on and off", async () => {
    const page = await openGutter(width, true);
    const off = await columns(page);
    await act(page, (h) => h.setLineNumbers(true));
    const on = await columns(page);
    expect(on.numbers).not.toBeNull();
    const numbersWidth = on.numbers![1] - on.numbers![0];
    expect(numbersWidth).toBeGreaterThan(0);
    expect(on.mark).toEqual(off.mark);
    expect(on.numbers![0]).toBe(off.mark[1]);
    expect(on.fold[0] - off.fold[0]).toBeCloseTo(numbersWidth, 3);
    expect(on.textLeft - off.textLeft).toBeCloseTo(numbersWidth, 3);
    await act(page, (h) => h.setLineNumbers(false));
    expect(await columns(page)).toEqual(off);
    await page.context().close();
  });

  it("gives a pin, a breakpoint and the fold arrow each a 44px target, and a tap at each x goes to one of them or the text", async () => {
    const page = await openGutter(width, true);
    await act(page, (h) => {
      h.setChoices([{ line: 2, pinned: false }]);
      h.setBreakpoints([4]);
      h.setCaret(8);
    });
    expect(await tapsAcross(page, 2)).toBe("choice@0 fold arrow@44 text@60");
    expect(await tapsAcross(page, 4)).toBe("breakpoint@0 fold column@44 text@60");
    expect(await tapsAcross(page, 8)).toBe("mark column@0 fold column@44 text@60");
    await act(page, (h) => h.setCaret(2));
    expect(await tapsAcross(page, 2)).toBe("choice@0 fold arrow@44 text@60");
    for (const target of await targets(page)) {
      expect(target.size).toEqual([44, 44]);
    }
    await act(page, (h) => h.fold(2));
    expect(await tapsAcross(page, 2)).toBe("choice@0 fold arrow@44 text@60");
    expect(await page.locator(".cm-fold-marker-closed").count()).toBeGreaterThan(0);
    await page.context().close();
  });
});

describe("the gutter under a fine pointer with line numbers off", () => {
  it("keeps its 14px mark column and the hidden line numbers' width, so the text does not move", async () => {
    const page = await openGutter(1440, false);
    const off = await columns(page);
    expect(off.mark[1] - off.mark[0]).toBe(14);
    expect(off.numbers).not.toBeNull();
    await act(page, (h) => h.setChoices([{ line: 5, pinned: false }]));
    await act(page, (h) => h.setLineNumbers(true));
    expect(await columns(page)).toEqual(off);
    await page.context().close();
  });
});

import { describe, expect, test } from "vitest";
import ScreenplayParser from "../../../../sparkdown-screenplay/src/classes/ScreenplayParser";
import ScreenplayTypesetter from "../../../../sparkdown-screenplay/src/classes/ScreenplayTypesetter";
import type { PageLine } from "../../../../sparkdown-screenplay/src/types/DocumentSpan";
import { type Cell, renderedBeat, script, show } from "./harness/displayStyleHarness";
import {
  CHOICE_CORPUS,
  CORPUS,
  PAIRING_LINES,
  cellsBetween,
  treeReading,
} from "./harness/displayStylingCorpus";

const UNPRINTED_STYLES = new Set(["wavy", "shaky", "raw"]);
const VALUE_COLOR = "#808080";

const printable = (cells: Cell[], centered = true): Cell[] =>
  cells.map(({ char, style }) => ({
    char,
    style: style
      .split(" ")
      .filter((s) => s && !UNPRINTED_STYLES.has(s) && (centered || s !== "centered"))
      .join(" "),
  }));

const visible = (cells: Cell[], centered = true): string =>
  show(printable(cells, centered).filter(({ char }) => !/\s/.test(char)));

const printedLines = (source: string): PageLine[] =>
  new ScreenplayTypesetter()
    .compose(new ScreenplayParser().parse(source))
    .flatMap((span) =>
      "lines" in span
        ? span.lines
        : span.tag === "dual"
          ? [...(span.positions.l ?? []), ...(span.positions.r ?? [])]
          : [],
    );

const printedCells = (lines: PageLine[]): Cell[] => {
  const cells: Cell[] = [];
  for (const line of lines) {
    let inValue = false;
    for (const run of line.content) {
      const style = [
        run.bold ? "bold" : "",
        run.italic ? "italic" : "",
        run.underline ? "underline" : "",
        run.align === "center" ? "centered" : "",
      ]
        .filter(Boolean)
        .sort()
        .join(" ");
      if (run.color === VALUE_COLOR) {
        if (!inValue) {
          for (const char of "plain") cells.push({ char, style });
        }
        inValue = true;
        continue;
      }
      inValue = false;
      for (const char of run.text) cells.push({ char, style });
    }
  }
  return cells;
};

const BODY_TAGS = new Set([
  "action",
  "dialogue_character",
  "dialogue_parenthetical",
  "dialogue_content",
]);

describe("the screenplay prints display lines styled as the player renders them", () => {
  test.each(CORPUS.map((c) => [c.label, c] as const))("%s", async (_label, c) => {
    const source = script(c.body);
    const cellsOf = await renderedBeat(source);
    const centered = !c.parts?.some((part) => part.aligned);
    const rendered = (c.parts ?? []).flatMap((part) => cellsOf(part.target));
    const printed = printedCells(printedLines(source).filter((line) => BODY_TAGS.has(line.tag)));
    expect(visible(printed, centered)).toBe(visible(rendered, centered));
  });
});

describe("the screenplay prints the mark pairing corpus as the grammar reads it", () => {
  test("every line", () => {
    const mismatches: { line: string; grammar: string; printed: string }[] = [];
    for (const line of PAIRING_LINES) {
      const source = script(line);
      const from = source.indexOf(line, source.indexOf("scene start"));
      const grammar = visible(cellsBetween(treeReading(source), source, from, from + line.length).tree);
      const printed = visible(
        printedCells(printedLines(source).filter((printedLine) => printedLine.tag === "action")),
      );
      if (printed !== grammar) mismatches.push({ line, grammar, printed });
    }
    expect(mismatches).toEqual([]);
  });
});

describe("the screenplay prints the title page as the grammar reads it", () => {
  test("a front matter value's spans are styled and an unclosed mark is text", () => {
    const source = `---\ntitle:\n  **_THE TITLE_**\nnotes:\n  *Open note\n  ends here*\n---\n\n${script("Hi")}`;
    const [meta] = new ScreenplayTypesetter().compose(new ScreenplayParser().parse(source));
    const lines = meta?.tag === "meta" ? Object.values(meta.positions).flat() : [];
    const shown = (tag: string) =>
      lines
        .filter((line) => line.tag === tag)
        .map((line) => show(printedCells([line])))
        .filter(Boolean);
    expect(shown("meta:title")).toEqual(["[bold centered underline: THE TITLE]"]);
    expect(shown("meta:notes")).toEqual(["*Open note", "ends here*"]);
  });
});

describe("the screenplay prints choice text as the grammar reads it", () => {
  test.each(CHOICE_CORPUS)("%s", (text) => {
    const source = script(`choose\n    + ${text}\n      Done.\n  end`);
    const from = source.indexOf(`+ ${text}`) + 2;
    const grammar = cellsBetween(treeReading(source), source, from, from + text.length).tree;
    const [choice] = printedLines(source).filter((line) => line.tag === "choice");
    const printed = printedCells([choice!]);
    expect(printed.slice(0, 2).map(({ char }) => char).join("")).toBe("+ ");
    expect(visible(printed.slice(2))).toBe(visible(grammar));
  });
});

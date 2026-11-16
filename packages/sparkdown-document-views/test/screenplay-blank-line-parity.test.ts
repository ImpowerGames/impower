import { afterAll, describe, expect, it } from "vitest";
import { insertedAt } from "../../sparkdown-screenplay/src/utils/printedPosition";
import {
  type PrintedPlaces,
  placePrintedLine,
} from "../../sparkdown-screenplay/src/utils/screenplayPageLayout";
import type { ScreenplayConfig } from "../../sparkdown-screenplay/src/types/ScreenplayConfig";
import { isHiddenIdentifier } from "../../sparkdown-screenplay/src/utils/isHiddenIdentifier";
import { SOURCE_COLOR } from "../../sparkdown-screenplay/src/utils/styleText";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayCsvData } from "../../sparkdown-screenplay/src/utils/generateScreenplayCsvData";
import { generateScreenplayPrintData } from "../../sparkdown-screenplay/src/utils/generateScreenplayPrintData";
import { setScreenplayConfig } from "../src/modules/screenplay-preview/utils/screenplaySettings";
import { extractPdfText } from "./helpers/pdfText";
import {
  KINDS,
  GLUED_LAYOUTS,
  ALTERNATIVE_LAYOUTS,
  ONE_BRANCH_LAYOUTS,
  PRINTED,
  compact,
  missingText,
  BASE,
  CONFIGS,
  CHUNKS,
  sourceOf,
  views,
  show,
  isHidden,
  visibleText,
  trimBlankRows,
  rowsOf,
  screenRows,
  exportRows,
  layout,
  difference,
  flagsOf,
  pageStyleOf,
  numberIsBold,
  unplacedText,
  styleDifference,
  closeViews,
} from "./helpers/screenplayParity";

afterAll(closeViews);

const CONTAINERS: Record<string, { open: string[]; close: string[]; indent: string; prints: string[] }> = {
  if: { open: ["  if true then"], close: ["  end"], indent: "  ", prints: [] },
  elseif: { open: ["  if false then", "    No.", "  elseif true then"], close: ["  end"], indent: "  ", prints: ["No."] },
  else: { open: ["  if false then", "    No.", "  else"], close: ["  end"], indent: "  ", prints: ["No."] },
  while: { open: ["  while true do"], close: ["  end"], indent: "  ", prints: [] },
  for: { open: ["  for i = 1, 2 do"], close: ["  end"], indent: "  ", prints: [] },
  repeat: { open: ["  repeat"], close: ["  until true"], indent: "  ", prints: [] },
  do: { open: ["  do"], close: ["  end"], indent: "  ", prints: [] },
  branch: { open: ["  branch b"], close: ["  end"], indent: "  ", prints: [] },
  choice: { open: ["  choose", "    * [Go.]"], close: ["  end"], indent: "    ", prints: ["* [Go.]"] },
  queueBranch: {
    open: ["  queue", "    | First one | Second one", "    | Third line"],
    close: ["  end"],
    indent: "    ",
    prints: ["First one | Second one", "Third line"],
  },
  matchBranch: { open: ["  match x", "    | Small."], close: ["  end"], indent: "    ", prints: ["Small."] },
};

const NOT_NESTABLE = new Set([
  "LuauShebang",
  "Scene",
  "LuauEndKeyword",
  "TrailingWhitespace",
  "LuauStrayUntilStatement",
  "LuauSparkdownElseBlock",
  "LuauSparkdownElseifBlock",
]);

const NESTED_KINDS = Object.keys(KINDS).filter((kind) => !NOT_NESTABLE.has(kind));

const NESTED_CHUNK = 12;

const NESTED_CHUNKS = Array.from({ length: Math.ceil(NESTED_KINDS.length / NESTED_CHUNK) }, (_, index) =>
  NESTED_KINDS.slice(index * NESTED_CHUNK, (index + 1) * NESTED_CHUNK),
);

const nestedSourceOf = (container: string, kinds: readonly string[]) => {
  const { open, close, indent } = CONTAINERS[container]!;
  const body = kinds.flatMap((kind) => KINDS[kind]!.map((line) => (line ? `${indent}${line}` : line)));
  return ["scene s", "  Before.", ...open, ...body, ...close, "  After.", "end", ""].join("\n");
};

describe("screenplay page and export agree on text inside blocks", () => {
  it.each(Object.keys(CONFIGS).flatMap((configName) => Object.keys(CONTAINERS).map((container) => [configName, container])))(
    "with %s settings inside %s",
    async (configName, container) => {
      const failures: string[] = [];
      for (const [index, kinds] of NESTED_CHUNKS.entries()) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const source = nestedSourceOf(container, kinds);
        const screen = screenRows(configName, source);
        const found = difference(screen, exportRows(configName, source));
        if (found) {
          failures.push(`sequence ${index}: ${found}; kinds ${kinds.join(" > ")}`);
        }
        const styles = styleDifference(configName, source);
        if (styles) {
          failures.push(`sequence ${index}: ${styles}; kinds ${kinds.join(" > ")}`);
        }
        const unplaced = unplacedText(configName, source);
        if (unplaced.length) {
          failures.push(`sequence ${index}: the export printed text the page has no place for ${JSON.stringify(unplaced)}; kinds ${kinds.join(" > ")}`);
        }
        const expected = [...CONTAINERS[container]!.prints, ...kinds.flatMap((kind) => PRINTED[kind] ?? [])];
        const missing = missingText(screen, expected);
        if (missing.length) {
          failures.push(`sequence ${index}: page lacks ${JSON.stringify(missing)}; kinds ${kinds.join(" > ")}`);
        }
      }
      expect(failures).toEqual([]);
    },
    600_000,
  );
});

describe("the ticket's nested loop and alternator", () => {
  it("shows only the text the export prints", () => {
    const source = [
      "scene s",
      "  INT. ROOM - DAY",
      "  local x = 0",
      "  if x == 0 then",
      "    while x < 3 do",
      "      Hero: Again.",
      "      x += 1",
      "    end",
      "  end",
      "  Hero: Hi.",
      "  queue",
      "    | First one | Second one",
      "    | Third line",
      "        Hero: Multi.",
      "  end",
      "end",
      "",
    ].join("\n");
    const expected = ["INT. ROOM - DAY", "", "{", "| Hero", "  Again.", "}", "Hero", "Hi.", "", "{","| First one | Second one", "| Third line", "  Hero", "  Multi.", "}"];
    const screen = screenRows("default", source);
    expect(layout(screen)).toBe(layout(expected));
    expect(layout(exportRows("default", source))).toBe(layout(expected));
    expect(screen.join("\n")).not.toMatch(/x\s*<\s*3|x\s*\+=\s*1|queue|end/m);
  });
});

describe("the element sequences", () => {
  it("cover every ordered pair of top-level kinds", () => {
    const pairs = new Set<string>();
    for (const kinds of CHUNKS) {
      for (let index = 1; index < kinds.length; index++) pairs.add(`${kinds[index - 1]} > ${kinds[index]}`);
    }
    expect(pairs.size).toBe(Object.keys(KINDS).length ** 2);
  });
});

describe("front matter before the body", () => {
  it.each([true, false])("prints no extra blank line with the title page %s", (titlePage) => {
    const source = ["---", "title: The Heist", "---", "", sourceOf(["ImplicitAction", "LuauSparkdownChooseBlock"])].join("\n");
    const config = { ...BASE, screenplay_print_title_page: titlePage };
    const configName = `title page ${titlePage}`;
    CONFIGS[configName] = config;
    const rows = screenRows(configName, source);
    const screen = trimBlankRows(rows.slice(rows.findIndex((row) => row === "Before.")));
    const printed = exportRows(configName, source);
    const body = trimBlankRows(printed.slice(printed.indexOf("Before.")));
    expect(difference(screen, body)).toBe("");
  });
});

describe("a blank line written after a block", () => {
  it("prints after the block in the export and on the page", () => {
    const source = sourceOf(["BlockTransitional", "Whitespace", "BlockTitle", "Whitespace"]);
    const expected = ["Before.", "CUT TO:", "", "THE END", "", "After."];
    expect(exportRows("default", source)).toEqual(expected);
    expect(layout(screenRows("default", source))).toBe(layout(expected));
  });

  it("prints where it is written inside a block", () => {
    const source = sourceOf(["BlockActionInnerBlank", "BlockActionLeadingBlank"]);
    const expected = ["Before.", "First.", "", "Second.", "", "First.", "After."];
    expect(exportRows("default", source)).toEqual(expected);
    expect(layout(screenRows("default", source))).toBe(layout(expected));
  });
});

describe("a heading split by a blank line", () => {
  it("is numbered once, on the page and in the export", () => {
    const source = sourceOf(["InlineHeading", "BlockHeadingInnerBlank"]);
    const spans = generateScreenplayPrintData(new ScreenplayParser().parse(source), CONFIGS["default"]).spans;
    const exported = spans.flatMap((span) =>
      span.tag === "heading" ? [`${span.lines[0]?.scene ?? "-"} ${span.lines.map((l) => l.content.map((c) => c.text).join("")).join("|")}`] : [],
    );
    expect(exported).toEqual(["1 INT. ROOM - DAY", "2 INT. A", "- INT. B"]);
    const view = show("default", source);
    const numbered = Array.from(view.contentDOM.querySelectorAll<HTMLElement>(".sp-heading")).map(
      (heading) => heading.dataset["sceneNumber"],
    );
    expect(numbered).toEqual(["1", "2"]);
  });
});

describe("a line shared by a hidden node and printed text", () => {
  it.each(["default", "function identifiers"])("keeps the printed text with %s settings", (configName) => {
    const source = sourceOf(["LuauFunctionDefinitionSharedLine"]);
    const name = configName === "default" ? [] : ["f2"];
    const expected = ["Before.", "", ...name, "Same line.", "After."];
    expect(exportRows(configName, source)).toEqual(expected);
    expect(layout(screenRows(configName, source))).toBe(layout(expected));
  });

  it("follows a name setting changed on a page already on screen", () => {
    const source = sourceOf(["LuauFunctionDefinitionPairSharedLine"]);
    expect(layout(screenRows("default", source))).toBe(layout(["Before.", "", "Shared.", "After."]));
    const view = views.get("default")!;
    view.dispatch({ effects: setScreenplayConfig.of(CONFIGS["function identifiers"]) });
    const rows = rowsOf(view);
    view.dispatch({ effects: setScreenplayConfig.of(CONFIGS["default"]) });
    expect(layout(trimBlankRows(rows))).toBe(layout(["Before.", "", "f5", "", "f6", "Shared.", "After."]));
  });

  it.each([
    ["default", "LuauFunctionDefinitionThenCommentSharedLine", ["", "Shared."]],
    ["function identifiers", "LuauFunctionDefinitionThenCommentSharedLine", ["", "f4", "", "Shared."]],
    ["default", "SparkdownBlockCommentThenFunctionSharedLine", ["", "Shared."]],
    ["function identifiers", "SparkdownBlockCommentThenFunctionSharedLine", ["", "f3", "Shared."]],
    ["default", "LuauFunctionDefinitionPairSharedLine", ["", "Shared."]],
    ["function identifiers", "LuauFunctionDefinitionPairSharedLine", ["", "f5", "", "f6", "Shared."]],
    ["default", "LuauFunctionDefinitionPairOnly", [""]],
    ["function identifiers", "LuauFunctionDefinitionPairOnly", ["", "f7", "", "f8"]],
    ["default", "LuauFunctionDefinitionThenCommentOnly", [""]],
    ["function identifiers", "LuauFunctionDefinitionThenCommentOnly", ["", "f9", ""]],
    ["default", "SparkdownBlockCommentThenFunctionOnly", [""]],
    ["function identifiers", "SparkdownBlockCommentThenFunctionOnly", ["", "f10"]],
    ["default", "BlockDialogueInnerBlank", ["GUIDE", "First line.", "", "Second line."]],
  ] as const)("keeps every hidden part in order with %s settings: %s", (configName, kind, rows) => {
    const source = sourceOf([kind]);
    const expected = ["Before.", ...rows, "After."];
    expect(exportRows(configName, source)).toEqual(expected);
    expect(layout(screenRows(configName, source))).toBe(layout(expected));
  });
});

describe("an alternative written inside a sentence", () => {
  it.each(Object.entries(GLUED_LAYOUTS))("prints %s as its layout row, on the page as in the export", (kind, rows) => {
    const source = sourceOf([kind]);
    const printed = exportRows("default", source);
    expect(printed.filter((row) => row && row !== "Before." && row !== "After.")).toEqual(rows);
    expect(layout(screenRows("default", source))).toBe(layout(printed));
  });
});

const exportLines = (configName: string, source: string): string[] => {
  const config = CONFIGS[configName];
  return trimBlankRows(
    extractPdfText(source, config)
      .split("\n")
      .filter((row) => !isHiddenIdentifier(row.match(/^<(\w+)>/)?.[1], config))
      .map((row) => row.replace(/^<[^>]*> ?/, "").trimEnd()),
  );
};

const visibleLines = (element: Element): string[] => {
  const lines = [""];
  const walk = (parent: Element) => {
    parent.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) lines[lines.length - 1] += node.textContent ?? "";
      else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).classList.contains("sp-break")) lines.push("");
      else if (node.nodeType === Node.ELEMENT_NODE && !isHidden(node as Element, true)) {
        const style = (node as HTMLElement).style;
        const block = style?.display === "block" && style.marginLeft.startsWith("-");
        if (block && lines[lines.length - 1]) lines.push("");
        walk(node as Element);
        if (block && lines[lines.length - 1]) lines.push("");
      }
    });
  };
  walk(element);
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
};

const pageLines = (configName: string, source: string): string[] => {
  const view = show(configName, source);
  const lines: string[] = [];
  for (const row of Array.from(view.contentDOM.children)) {
    if (isHidden(row, false)) continue;
    const shown = getComputedStyle(row).opacity !== "0";
    const inner = Array.from(row.querySelectorAll("div")).filter((div) => !div.querySelector("div"));
    if (inner.length > 0) {
      for (const div of inner) {
        const text = visibleText(div);
        if (shown && text.trim()) lines.push(text.trimEnd());      }
      continue;
    }
    const text = visibleText(row);
    if (shown && text.trim()) lines.push(...visibleLines(row).map((line) => line.trimEnd()));
    else if (!text.trim() && (text.length > 0 || row.querySelector("br"))) lines.push("");
  }
  return trimBlankRows(lines);
};

const besideBody = (rows: string[]) => rows.filter((row) => row && row !== "Before." && row !== "After.");

describe("a block of alternatives", () => {
  it.each(Object.entries(ALTERNATIVE_LAYOUTS))(
    "prints %s with its braces and bars, indentation included, on the page as in the export",
    (kind, rows) => {
      const source = sourceOf([kind]);
      const printed = exportLines("default", source);
      expect(besideBody(printed)).toEqual(rows);
      expect(pageLines("default", source)).toEqual(printed);
      expect(unplacedText("default", source)).toEqual([]);
    },
  );

  it.each(Object.entries(ONE_BRANCH_LAYOUTS))(
    "prints %s, a block with one branch or none that prints text, as request I-2401 answered, on the page as in the export",
    (kind, rows) => {
      const source = sourceOf([kind]);
      const printed = exportLines("default", source);
      expect(besideBody(printed)).toEqual(rows);
      expect(pageLines("default", source)).toEqual(printed);
      expect(unplacedText("default", source)).toEqual([]);
    },
  );

  it.each([
    ["first in its scene", ["scene s", ...KINDS["IfElseifElseBlock"]!, "  After.", "end", ""]],
    ["last in its scene", ["scene s", "  Before.", ...KINDS["LuauSparkdownSequentialAlternatorBlock"]!, "end", ""]],
    ["alone in its scene, before another scene", ["scene s", ...KINDS["NestedAlternators"]!, "end", "scene t", "  Next.", "end", ""]],
    ["right after dialogue", ["scene s", "  GUIDE: Hello.", ...KINDS["AlternatorDialogueBodies"]!, "  After.", "end", ""]],
    ["inside a choice's body", ["scene s", "  choose", "    * [Go.]", ...KINDS["IfElseDialogueBodies"]!.map((line) => `    ${line}`), "  end", "end", ""]],
    ["after a blank line and before one", ["scene s", "  Before.", "", ...KINDS["CycleAlternatorBlock"]!, "", "  After.", "end", ""]],
    ["with a blank line between its alternatives", ["scene s", "  Before.", "  queue", "    | One.", "", "    | Two.", "  end", "end", ""]],
  ])("draws its rows where the export prints them, %s", (_where, lines) => {
    const source = lines.join("\n");
    for (const configName of ["default", "scene identifiers", "branch identifiers", "function identifiers"]) {
      const printed = exportLines(configName, source);
      expect(printed.filter((row) => /^ *[{}]$/.test(row)).length, configName).toBeGreaterThanOrEqual(2);
      expect(pageLines(configName, source), configName).toEqual(printed);
      expect(unplacedText(configName, source), configName).toEqual([]);
    }
  });
});

describe("two blocks of alternatives on one source line", () => {
  it("keep each block's braces around its own alternatives, on the page as in the export", () => {
    const source = ["scene s", "  Before.", "  queue | One A. | One B. end queue | Two A. | Two B. end", "  After.", "end", ""].join("\n");
    const rows = ["{", "| One A.", "| One B.", "}", "{", "| Two A.", "| Two B.", "}"];
    expect(besideBody(exportLines("default", source))).toEqual(rows);
    expect(besideBody(pageLines("default", source))).toEqual(rows);
    expect(unplacedText("default", source)).toEqual([]);
  });

  it("put the export's blank line between the two blocks, on the page as in the export", () => {
    const source = ["scene s", "  Before.", "  queue | One A. | One B. end queue | Two A. | Two B. end", "  After.", "end", ""].join("\n");
    const printed = exportLines("default", source);
    expect(printed.slice(printed.indexOf("}"), printed.indexOf("}") + 3)).toEqual(["}", "", "{"]);
    expect(pageLines("default", source)).toEqual(printed);
  });
});

describe("a blank line the export prints inside one source line", () => {
  it.each([
    ["between a block and following text", ["  queue | One. | Two. end They go."]],
    ["between a block and following dialogue", ["  queue | One. | Two. end GUIDE: Hi."]],
    ["between two one-line blocks of different kinds", ["  queue | One. | Two. end cycle | Three. | Four. end"]],
    ["between three one-line blocks", ["  queue | A. | B. end queue | C. | D. end queue | E. | F. end"]],
    ["after a one-line block inside a branch", ["  if a then", "    queue | One. | Two. end queue | Three. | Four. end", "  end"]],
    ["before a centred span", ["  queue | One. | Two. end ^Up^ they go."]],
    ["after a centred span", ["  They ^go^ queue | One. | Two. end"]],
  ])("is drawn where the export prints it, %s", (_where, lines) => {
    const source = ["scene s", "  Before.", ...lines, "  After.", "end", ""].join("\n");
    for (const configName of Object.keys(CONFIGS)) {
      expect(pageLines(configName, source), configName).toEqual(exportLines(configName, source));
      expect(unplacedText(configName, source), configName).toEqual([]);
    }
  });
});

const UNPRINTED_ON_ONE_LINE: Record<string, string> = {
  "a function definition": "function f() end",
  "a variable definition": "local z = 3",
  "a reassignment": "x = 2",
  "an explicit statement": "& x = 1",
  "a block comment": "/* note */",
  "an include directive": "include other",
};

const PRINTED_ON_ONE_LINE: Record<string, string> = {
  "a one-line alternator": "queue | One. | Two. end",
  "a one-line cycle": "cycle | One. | Two. end",
  "a one-line match": "match(x) | Small. | Big. end",
  "dialogue": "GUIDE: Hi.",
  "action": ": They go.",
  "a choice": "* [Go.]",
};

const SHARED_LINE_ORDERS = Object.entries(UNPRINTED_ON_ONE_LINE).flatMap(([unprintedName, unprinted]) =>
  Object.entries(PRINTED_ON_ONE_LINE).flatMap(([printedName, printed]) => [
    [`${unprintedName} before ${printedName}`, `${unprinted} ${printed}`],
    [`${printedName} before ${unprintedName}`, `${printed} ${unprinted}`],
  ]),
)
  .concat(Object.entries(PRINTED_ON_ONE_LINE).map(([printedName, printed]) => [`${printedName} before a line comment`, `${printed} // note`]))
  .concat(
    Object.entries(UNPRINTED_ON_ONE_LINE).flatMap(([unprintedName, unprinted]) => [
      [`${unprintedName} between two one-line blocks`, `queue | One. | Two. end ${unprinted} cycle | Three. | Four. end`],
      [`a one-line block between two of ${unprintedName}`, `${unprinted} queue | One. | Two. end ${unprinted}`],
    ]),
  );

describe("a line shared by a construct that prints nothing and one that prints", () => {
  it("draws the arms of a one-line alternator after a one-line function definition, on the page as in the export", () => {
    const source = ["scene s", "  Before.", "  function f() end queue | One. | Two. end", "  After.", "end", ""].join("\n");
    const printed = exportLines("default", source);
    expect(printed).toEqual(["Before.", "", "{", "| One.", "| Two.", "}", "After."]);
    expect(pageLines("default", source)).toEqual(printed);
  });

  it.each(SHARED_LINE_ORDERS)(
    "draws what the export prints for %s",
    (_name, line) => {
      const source = ["scene s", "  Before.", `  ${line}`, "  After.", "end", ""].join("\n");
      for (const configName of Object.keys(CONFIGS)) {
        expect(pageLines(configName, source), configName).toEqual(exportLines(configName, source));
        expect(unplacedText(configName, source), configName).toEqual([]);
      }
    },
  );
});

describe("the translation strings of a block of alternatives", () => {
  it("are the author's own text, with no braces, bars or indentation", () => {
    const source = sourceOf(["IfElseDialogueBodies", "AlternatorChoiceBodies", "LuauSparkdownIfElseBlock", "SingleLineAlternatorThenAction"]);
    const rows = generateScreenplayCsvData(new ScreenplayParser().parse(source)).slice(1);
    expect(rows.map(([, context, text]) => `${context} ${text!.trimEnd()}`)).toEqual([
      "A Before.",
      "D Yes.",
      "D No.",
      "A No.",
      "A Yes.",
      "A Alpha.",
      "A Beta.",
      "A After them.",
      "A After.",
    ]);
  });
});

describe("a title page field", () => {
  it("shows the text the export prints, with markup and an interpolation", () => {
    const config = { ...BASE, screenplay_print_title_page: true };
    CONFIGS["title page field"] = config;
    const source = ["---", "title: The *Big* {place} Heist", "---", "", sourceOf(["ImplicitAction"])].join("\n");
    const printed = extractPdfText(source, config)
      .split("\n")
      .find((row) => row.includes("title:"))!;
    expect(printed.replace(/^.*title: /, "")).toBe("The Big {place} Heist");
    const view = show("title page field", source);
    const titlePage = view.contentDOM.querySelector(".sp-title-page") ?? view.contentDOM;
    expect(compact(visibleText(titlePage))).toContain(compact("The Big {place} Heist"));
  });
});

const WIDGET_CASES: [string, string, string][] = [
  ["title", "queue | A *cat* | A _dog_ end", "queue | A cat | A dog end"],
  ["title", "A {person .. '*bold*'} beside _word_.", "A {person .. 'bold'} beside word."],
  ["title", 'A {"&amp;"} beside *word*.', 'A {"&amp;"} beside word.'],
  ["dialogue", "A *bold .. queue | cat | dog .. bold* beside {person}.", "A *bold {cat|dog} bold* beside {person}."],
  ["dialogue", 'A {"<b>owl</b>"} beside *word*.', 'A {"<b>owl</b>"} beside word.'],
  ["title", 'A <b>x</b> &amp; "q" </script> end', 'A x &amp; "q"  end'],
];

describe("a widget on the page", () => {
  it.each(WIDGET_CASES)("draws the export's %s text for %s", (where, written, expected) => {
    const config = { ...BASE, screenplay_print_title_page: where === "title" };
    const configName = `widget ${where}`;
    CONFIGS[configName] = config;
    const source =
      where === "title"
        ? ["---", `title: ${written}`, "---", "", sourceOf(["ImplicitAction"])].join("\n")
        : ["scene s", "  Before.", `  GUIDE: ${written}`, "  After.", "end", ""].join("\n");
    const rows = extractPdfText(source, config).split("\n");
    const printed =
      where === "title"
        ? rows.find((row) => row.includes("title:"))!.replace(/^.*title: /, "")
        : rows.find((row) => row.startsWith("<dialogue>"))!.replace(/^<dialogue> /, "");
    expect(printed).toBe(expected);
    const view = show(configName, source);
    const widget =
      where === "title"
        ? view.contentDOM.querySelector(".sp-title-page")!
        : Array.from(view.contentDOM.children).find((row) => row.textContent?.includes("GUIDE"))!;
    expect(compact(visibleText(widget))).toContain(compact(expected));
  });
});

const TITLE_PAGE_CASES: [string, string[]][] = [
  ["a field written on two lines", ["title: First", "  Second"]],
  ["a field written twice", ["title: First", "title: Second"]],
  ["a key the export does not know", ["Title: First"]],
];

describe("the title page", () => {
  it.each(TITLE_PAGE_CASES)("shows what the export prints for %s", (_name, fields) => {
    const config = { ...BASE, screenplay_print_title_page: true };
    CONFIGS["title page cases"] = config;
    const source = ["---", ...fields, "---", "", sourceOf(["ImplicitAction"])].join("\n");
    const rows = extractPdfText(source, config).split("\n");
    const start = rows.indexOf("=== TITLE PAGE ===");
    const printed = start < 0 ? [] : rows.slice(start + 1, rows.indexOf("=== BODY ===")).map((row) => row.replace(/^\[[a-z]+\] [^:]*: /, ""));
    const view = show("title page cases", source);
    const titlePage = view.contentDOM.querySelector(".sp-title-page");
    expect(compact(titlePage ? visibleText(titlePage) : "")).toBe(compact(printed.join("")));
  });
});

describe("a single-line alternator", () => {
  it.each([
    ["at the top of a scene", ["  queue | Tea, please. | Coffee, please. end"]],
    ["inside an if", ["  if true then", "    queue | Tea, please. | Coffee, please. end", "  end"]],
    ["inside a choice", ["  choose", "    * [Go.]", "      queue | Tea, please. | Coffee, please. end", "  end"]],
  ] as const)("prints each branch on its own line, on the page as in the export, %s", (_where, lines) => {
    const source = ["scene s", "  Before.", ...lines, "  After.", "end", ""].join("\n");
    const printed = exportRows("default", source);
    expect(printed.filter((row) => row.endsWith("please."))).toEqual(["| Tea, please.", "| Coffee, please."]);
    const screen = screenRows("default", source);
    expect(layout(screen)).toBe(layout(printed));
    const view = views.get("default")!;
    const row = Array.from(view.contentDOM.children).find((element) => element.textContent?.includes("Tea, please."))!;
    expect(row.querySelectorAll(".sp-break")).toHaveLength(1);
    expect(visibleText(row)).not.toMatch(/queue|end/);
  });
});

describe("the ticket's script", () => {
  it("puts the export's blank line between dialogue and a following choice", () => {
    const source = [
      "scene lighthouse",
      "  $: INT. LIGHTHOUSE - CONTINUOUS",
      "  GUIDE:",
      "    More than you would like.",
      "  choose",
      "    * [Climb.]",
      "      They climb.",
      "  end",
      "end",
      "",
    ].join("\n");
    const screen = screenRows("default", source);
    const index = screen.indexOf("More than you would like.");
    expect(screen.slice(index, index + 3)).toEqual(["More than you would like.", "", "* [Climb.]"]);
  });
});

const MARKUP_KINDS = Object.keys(KINDS).filter((kind) => kind.endsWith("Markup") || kind.endsWith("Escape"));

describe("a block heading", () => {
  const config: ScreenplayConfig = { ...BASE, screenplay_print_headings_bold: true, screenplay_print_scene_numbers: "left" };
  CONFIGS["bold headings"] = config;

  it.each([
    ["the bug's script", ["scene street", "  $: EXT. STREET - NIGHT", "  The rain stops.", "  $:", "    INT. HALL - NIGHT", "  The lights come up.", "end", ""].join("\n")],
    ["a blank line inside it", sourceOf(["InlineHeading", "BlockHeadingInnerBlank"])],
    ["markup on every line kind", sourceOf(MARKUP_KINDS)],
  ])("is bold and numbered on its text's row, on the page as in the export, for %s", (_name, source) => {
    const screen = screenRows("bold headings", source);
    expect(difference(screen, exportRows("bold headings", source))).toBe("");
    expect(styleDifference("bold headings", source)).toBe("");
  });

  it("numbers the row holding the heading text", () => {
    const source = ["scene street", "  $:", "    INT. HALL - NIGHT", "  The lights come up.", "end", ""].join("\n");
    screenRows("bold headings", source);
    const headings = Array.from(views.get("bold headings")!.contentDOM.querySelectorAll<HTMLElement>(".sp-heading"));
    expect(headings.map((heading) => [heading.dataset["sceneNumber"], visibleText(heading).trim()])).toEqual([["1", "INT. HALL - NIGHT"]]);
    expect(headings.map(numberIsBold)).toEqual([true]);
  });

  it("prints the scene number in regular weight when headings are not bold", () => {
    CONFIGS["plain headings"] = { ...config, screenplay_print_headings_bold: false };
    const source = ["scene street", "  $:", "    INT. HALL - NIGHT", "end", ""].join("\n");
    screenRows("plain headings", source);
    const headings = Array.from(views.get("plain headings")!.contentDOM.querySelectorAll<HTMLElement>(".sp-heading"));
    expect(headings.map(numberIsBold)).toEqual([false]);
    expect(styleDifference("plain headings", source)).toBe("");
  });
});

describe("a tab in printed text", () => {
  it("shows the spaces the export prints, character for character", () => {
    const source = ["scene s", "  : A\tB", "  : A    B", "end", ""].join("\n");
    const printed = exportRows("default", source);
    expect(printed).toEqual(["A    B", "A    B"]);
    screenRows("default", source);
    const rows = Array.from(views.get("default")!.contentDOM.children)
      .map((row) => visibleText(row))
      .filter((text) => text.trim());
    expect(rows).toEqual(printed);
  });

  it.each([
    ["a tab inside underlined text", "  : _A\tB_ end.", "    ", "u"],
    ["a tab inside an emphasised interpolation", "  : *{a\tb}* tail.", "    ", "is"],
    ["a glued alternative's join inside underlined text", "  _They see .. queue | a cat | a dog .. outside._", "|", ""],
  ])("styles the export's text drawn in place of the source for %s", (_name, line, drawn, flags) => {
    const source = ["scene s", line, "end", ""].join("\n");
    const spans = generateScreenplayPrintData(new ScreenplayParser().parse(source), CONFIGS["default"]).spans;
    const pieces = spans.flatMap((span) => ("lines" in span ? span.lines.flatMap((printedLine) => printedLine.content) : []));
    const exported = pieces.find((piece) => piece.text.includes(drawn))!;
    expect(exported, `the export prints ${JSON.stringify(drawn)}`).toBeDefined();
    screenRows("default", source);
    const inserted = Array.from(views.get("default")!.contentDOM.querySelectorAll(".sp-inserted")).find(
      (element) => element.textContent === drawn,
    )!;
    expect(inserted, `the page draws ${JSON.stringify(drawn)} in place of the source`).toBeDefined();
    const row = inserted.closest(".cm-line")!;
    expect(flagsOf(pageStyleOf(inserted, row, new Map()))).toBe(
      flagsOf({ ...exported, align: undefined, source: exported.color === SOURCE_COLOR }),
    );
    expect(flagsOf({ ...exported, align: undefined, source: exported.color === SOURCE_COLOR })).toBe(flags);
  });
});

const pageRowTexts = (configName: string) =>
  Array.from(views.get(configName)!.contentDOM.children)
    .filter((row) => !isHidden(row, false) && getComputedStyle(row).opacity !== "0")
    .map((row) => visibleText(row).trim())
    .filter((text) => text);

describe("a speaker line followed by a line the grammar reads as action", () => {
  it("keeps each on its own row, as the export prints them", () => {
    const source = sourceOf(["BlockDialogueThenCentredAction"]);
    const printed = exportRows("default", source).filter((row) => row);
    expect(printed).toEqual(["Before.", "GUIDE", "Hello there.", "After."]);
    screenRows("default", source);
    expect(pageRowTexts("default")).toEqual(printed);
  });
});

describe("text the export inserts", () => {
  it.each([
    ["two alternatives on one line, each joined by the same text", "GluedTwiceOneLine"],
    ["an alternative beside source text equal to its join", "GluedBesideSameText"],
    ["an alternative in dialogue", "GluedDialogueAlternator"],
    ["an alternative in a choice", "GluedChoiceAlternator"],
  ])("is drawn where the export places it, for %s", (_name, kind) => {
    const source = sourceOf([kind]);
    const printed = exportRows("default", source).filter((row) => row);
    screenRows("default", source);
    expect(pageRowTexts("default").join("")).toBe(printed.join(""));
    expect(unplacedText("default", source)).toEqual([]);
  });

  it.each([
    ["an empty alternative", "GluedEmptyArm", "They see {|a dog} outside."],
    ["a trailing empty alternative", "GluedTrailingEmptyArm", "They see {a dog|} outside."],
    ["an empty alternative of a conditional alternator", "GluedConditionalEmptyArm", "It is {|warm} today."],
    ["only empty alternatives", "GluedOnlyEmptyArms", "They see {|} outside."],
    ["a trailing empty alternative of a conditional alternator", "GluedConditionalTrailingEmptyArm", "It is {cold|} today."],
    ["a conditional alternator whose condition holds an alternator", "GluedNestedConditionAlternator", "It is {cold|warm} today."],
    ["an alternative holding a quoted bar", "GluedQuotedBarArm", "They see {{\"a|b\"}|a dog} outside."],
    ["an alternative holding a quoted brace", "GluedQuotedBraceArm", "They see {{\"{a}\"}|a dog} outside."],
    ["source braces beside an alternative", "GluedBesideSameText", "They see a } {a cat|a dog} } outside."],
  ])("prints the author's text unaltered inside the braces, for %s", (_name, kind, expected) => {
    const source = sourceOf([kind]);
    const printed = exportRows("default", source).filter((row) => row);
    expect(printed, JSON.stringify(printed)).toEqual(["Before.", expected, "After."]);
    screenRows("default", source);
    expect(pageRowTexts("default")).toEqual(printed);
    expect(unplacedText("default", source)).toEqual([]);
  });

  it("places each insert at its own anchor and reports text with no place", () => {
    const places: PrintedPlaces = { runs: [], inserts: [], rows: [], unplaced: [] };
    const style = { text: "", italic: true };
    placePrintedLine(
      {
        tag: "action",
        content: [
          {
            ...style,
            text: "a / b / c?",
            at: [0, insertedAt(1), insertedAt(1), insertedAt(1), 1, insertedAt(2), insertedAt(2), insertedAt(2), 2, -1],
          },
        ],
      },
      "abc",
      places,
    );
    expect(places.runs.map(({ from, to }) => [from, to])).toEqual([[0, 1], [1, 2], [2, 3]]);
    expect(places.inserts.map(({ at, text, style }) => [at, text, style.italic])).toEqual([
      [1, " / ", true],
      [2, " / ", true],
    ]);
    expect(places.unplaced).toEqual(["?"]);
  });

  it("places a row of inserted text at its anchor, on its side, and reports text in it with no place", () => {
    const places: PrintedPlaces = { runs: [], inserts: [], rows: [], unplaced: [] };
    const brace = (text: string, anchor: number) => Array.from(text, () => insertedAt(anchor));
    placePrintedLine({ tag: "action", row: "above", source: [], content: [{ text: "| {", at: brace("| {", 4) }] }, "abcdef", places);
    placePrintedLine(
      {
        tag: "action",
        row: "below",
        source: [],
        content: [
          { text: "  ", at: brace("  ", 5) },
          { text: "}", bold: true, at: [insertedAt(5)] },
          { text: "xy", at: [2, insertedAt(1)] },
          { text: "z" },
        ],
      },
      "abcdef",
      places,
    );
    expect(places.rows.map(({ at, side, pieces }) => [at, side, pieces.map((piece) => [piece.text, !!piece.style.bold])])).toEqual([
      [4, "above", [["| {", false]]],
      [5, "below", [["  ", false], ["}", true]]],
    ]);
    expect(places.runs).toEqual([]);
    expect(places.inserts).toEqual([]);
    expect(places.unplaced).toEqual(["x", "y", "z"]);
  });

  it.each([
    ["a piece with no positions", [{ text: "lost" }], ["lost"]],
    ["a piece with fewer positions than characters", [{ text: "ab", at: [0] }], ["b"]],
    ["an unmapped space between mapped characters", [{ text: "a b", at: [0, -1, 1] }], [" "]],
  ])("reports %s as text with no place", (_name, content, unplaced) => {
    const places: PrintedPlaces = { runs: [], inserts: [], rows: [], unplaced: [] };
    placePrintedLine({ tag: "action", source: [0, 2], content }, "ab", places);
    expect(places.unplaced).toEqual(unplaced);
  });
});

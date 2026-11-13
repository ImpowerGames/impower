import type { EditorView } from "@codemirror/view";
import { afterAll, describe, expect, it } from "vitest";
import type { ScreenplayConfig } from "../../sparkdown-screenplay/src/types/ScreenplayConfig";
import { isHiddenIdentifier } from "../../sparkdown-screenplay/src/utils/isHiddenIdentifier";
import createEditorView from "../src/modules/screenplay-preview/utils/createEditorView";
import { settleParse } from "./helpers/parseSettle";
import { extractPdfText } from "./helpers/pdfText";

const KINDS: Record<string, string[]> = {
  AudioLine: ["  ((play music))"],
  BlockAction: ["  :", "    The door creaks."],
  BlockActionInnerBlank: ["  :", "    First.", "", "    Second."],
  BlockActionLeadingBlank: ["  :", "", "    First."],
  BlockDialogue: ["  GUIDE:", "    (softly)", "    Hello there."],
  BlockHeading: ["  $:", "    INT. ROOM - DAY"],
  BlockHeadingInnerBlank: ["  $:", "    INT. A", "", "    INT. B"],
  BlockTitle: ["  ^:", "    THE END"],
  BlockTitleInnerBlank: ["  ^:", "    ONE", "    ", "    TWO"],
  BlockTransitional: ["  %:", "    CUT TO:"],
  BlockTransitionalInnerBlank: ["  %:", "    CUT", "", "    TO:"],
  BlockWrite: ["  @ hud:", "    Score up."],
  Branch: ["  branch b", "    Inside.", "  end"],
  Choice: ["  * [Stray.]"],
  Divert: ["  -> s"],
  DoneStatement: ["  done"],
  DualDialogue: ["  GUIDE <:", "    Left.", "  VISITOR >:", "    Right."],
  FinStatement: ["  fin"],
  ImageAndAudioLine: ["  [[show bg x]] ((play music))"],
  ImageLine: ["  [[show bg x]]"],
  ImplicitAction: ["  The door creaks."],
  Include: ["  include other"],
  InlineAction: ["  : The door creaks."],
  InlineDialogue: ["  GUIDE: Hello."],
  InlineHeading: ["  $: INT. ROOM - DAY"],
  InlineTitle: ["  ^: THE END"],
  InlineTransitional: ["  %: CUT TO:"],
  InlineWrite: ["  @ hud: Score up."],
  LabelAnchor: ["  label here"],
  LuauAnimation: ["  animation spin", "  end"],
  LuauBreakStatement: ["  break"],
  LuauComponent: ["  component card", "  end"],
  LuauContinueStatement: ["  continue"],
  LuauDataTypeDeclaration: ["  type T = number"],
  LuauDefine: ["  define thing", "  end"],
  LuauEndKeyword: ["  end"],
  LuauExternalDeclaration: ["  external outside"],
  LuauFunctionAttributes: ["  @native function g()", "  end"],
  LuauFunctionDefinition: ["  function f()", "    Inner.", "  end"],
  LuauFunctionDefinitionLocal: ["  local function lf()", "  end"],
  LuauFunctionDefinitionOneLine: ["  function f1() end"],
  LuauFunctionDefinitionSharedLine: ["  function f2() end : Same line."],
  LuauFunctionDefinitionThenCommentSharedLine: ["  function f4() end /* c */ : Shared."],
  SparkdownBlockCommentThenFunctionSharedLine: ["  /* c */ function f3() end : Shared."],
  LuauFunctionDefinitionPairSharedLine: ["  function f5() end function f6() end : Shared."],
  LuauSparkdownExplicitFunction: ["  & function h()", "  end"],
  LuauFunctionTypeDeclaration: ["  type function tf()", "  end"],
  LuauGotoStatement: ["  goto here"],
  LuauLabel: ["  ::here::"],
  LuauLayout: ["  layout box", "  end"],
  LuauMorph: ["  morph shape", "  end"],
  LuauScreen: ["  screen main", "  end"],
  LuauShebang: ["#!luau"],
  LuauSparkdownChooseBlock: ["  choose", "    * [Go.]", "      They go.", "  end"],
  LuauSparkdownConditionalAlternatorBlock: ["  match x", "    | Small.", "    | Big.", "  end"],
  LuauSparkdownDoBlock: ["  do", "    It snows.", "  end"],
  LuauSparkdownElseBlock: ["  else", "    Yes.", "  end"],
  LuauSparkdownElseifBlock: ["  elseif true then", "    Maybe.", "  end"],
  LuauSparkdownExplicitStatement: ["  & x = 1"],
  LuauSparkdownExplicitStatementBlock: ["  & do", "    local hidden = 8", "  end"],
  LuauSparkdownForLoop: ["  for i = 1, 2 do", "    Again.", "  end"],
  LuauSparkdownIfBlock: ["  if true then", "    It rains.", "  end"],
  LuauSparkdownIfElseBlock: ["  if false then", "    No.", "  else", "    Yes.", "  end"],
  LuauSparkdownReassignment: ["  x = 2"],
  LuauSparkdownRepeatLoop: ["  repeat", "    It drizzles.", "  until true"],
  LuauSparkdownSequentialAlternatorBlock: ["  queue", "    | First time.", "    | Second time.", "  end"],
  LuauSparkdownSingleLineConditionalAlternatorBlock: ["  match(x) | Small | Big end"],
  LuauSparkdownSingleLineSequentialAlternatorBlock: ["  queue | A # t | B end"],
  LuauSparkdownVariableDefinition: ["  local z = 3"],
  LuauSparkdownWhileLoop: ["  while false do", "    It hails.", "  end"],
  LuauStrayUntilStatement: ["  until true"],
  LuauStyle: ["  style bold", "  end"],
  LuauTheme: ["  theme dark", "  end"],
  Newline: [""],
  Run: ["  run other"],
  Scene: ["scene t"],
  SparkdownBlockComment: ["  /* note */"],
  SparkdownLineComment: ["  // note"],
  Tags: ["  # mood"],
  Thread: ["  <- other"],
  TrailingWhitespace: ["  end   "],
  Whitespace: ["    "],
};

const BASE: ScreenplayConfig = { screenplay_print_title_page: false };

const CONFIGS: Record<string, ScreenplayConfig> = {
  default: BASE,
  "scene identifiers": { ...BASE, screenplay_print_scene_identifiers: true },
  "branch identifiers": { ...BASE, screenplay_print_branch_identifiers: true },
  "function identifiers": { ...BASE, screenplay_print_function_identifiers: true },
};

const CHUNK = 24;

const circuit = (() => {
  const names = Object.keys(KINDS);
  const remaining = new Map(names.map((name) => [name, [...names]]));
  const stack = [names[0]!];
  const order: string[] = [];
  while (stack.length) {
    const next = remaining.get(stack.at(-1)!)!;
    if (next.length) stack.push(next.pop()!);
    else order.push(stack.pop()!);
  }
  return order.reverse();
})();

const CHUNKS = Array.from(
  { length: Math.ceil((circuit.length - 1) / (CHUNK - 1)) },
  (_, index) => circuit.slice(index * (CHUNK - 1), index * (CHUNK - 1) + CHUNK),
);

const sourceOf = (kinds: readonly string[]) =>
  ["scene s", "  Before.", ...kinds.flatMap((kind) => KINDS[kind]!), "  After.", "end", ""].join("\n");

const views = new Map<string, EditorView>();

afterAll(() => {
  for (const view of views.values()) {
    const parent = view.dom.parentElement;
    view.destroy();
    parent?.remove();
  }
});

const show = (configName: string, source: string): EditorView => {
  let view = views.get(configName);
  if (!view) {
    const parent = document.body.appendChild(document.createElement("div"));
    parent.style.width = "800px";
    view = createEditorView(parent, {
      textDocument: { uri: "file:///main.sd", version: 1, text: "" },
      config: CONFIGS[configName],
    });
    views.set(configName, view);
  }
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
  settleParse(view);
  return view;
};

const hiddenByClass = new Map<string, boolean>();

const isHidden = (element: Element, cache: boolean) => {
  const key = `${element.tagName}|${element.className}|${element.getAttribute("style") ?? ""}`;
  if (cache && hiddenByClass.has(key)) return hiddenByClass.get(key)!;
  const style = getComputedStyle(element);
  const hidden = style.display === "none" || style.visibility === "hidden";
  if (cache) hiddenByClass.set(key, hidden);
  return hidden;
};

const visibleText = (element: Element): string => {
  let text = "";
  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
    else if (node.nodeType === Node.ELEMENT_NODE && !isHidden(node as Element, true))
      text += visibleText(node as Element);
  });
  return text;
};

const trimBlankRows = (rows: string[]) => {
  while (rows[0] === "") rows.shift();
  while (rows.at(-1) === "") rows.pop();
  return rows;
};

const screenRows = (configName: string, source: string): string[] => {
  const view = show(configName, source);
  expect(view.contentDOM.querySelector(".cm-gap"), "every line rendered").toBeNull();
  const rows: string[] = [];
  for (const row of Array.from(view.contentDOM.children)) {
    if (isHidden(row, false)) continue;
    const text = visibleText(row);
    if (text.trim()) rows.push(text.trim());
    else if (text.length > 0 || row.querySelector("br")) rows.push("");
  }
  return trimBlankRows(rows);
};

const exportRows = (configName: string, source: string): string[] => {
  const config = CONFIGS[configName];
  return trimBlankRows(
    extractPdfText(source, config)
      .split("\n")
      .filter((row) => !isHiddenIdentifier(row.match(/^<(\w+)>/)?.[1], config))
      .map((row) => row.replace(/^<[^>]*> ?/, "").trim()),
  );
};

const BLANK = "¶";

const layout = (rows: string[]) =>
  rows
    .map((row) => row || BLANK)
    .join("")
    .replace(/\s+/g, "");

const difference = (screen: string[], printed: string[]) => {
  const page = layout(screen);
  const pdf = layout(printed);
  if (page === pdf) return "";
  let at = 0;
  while (at < page.length && page[at] === pdf[at]) at++;
  const around = (text: string) => text.slice(Math.max(0, at - 40), at + 40);
  return `page "${around(page)}" export "${around(pdf)}" (${BLANK} is a blank line)`;
};

describe("screenplay page and export agree on blank lines", () => {
  it.each(Object.keys(CONFIGS))(
    "for every element sequence with %s settings",
    async (configName) => {
      const failures: string[] = [];
      for (const [index, kinds] of CHUNKS.entries()) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const source = sourceOf(kinds);
        const screen = screenRows(configName, source);
        const printed = exportRows(configName, source);
        const found = difference(screen, printed);
        if (found) {
          failures.push(`sequence ${index}: ${found}; kinds ${kinds.join(" > ")}`);
        }
      }
      expect(failures).toEqual([]);
    },
    600_000,
  );
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

describe("a line shared by a hidden node and printed text", () => {
  it.each(["default", "function identifiers"])("keeps the printed text with %s settings", (configName) => {
    const source = sourceOf(["LuauFunctionDefinitionSharedLine"]);
    const name = configName === "default" ? [] : ["f2"];
    const expected = ["Before.", "", ...name, "Same line.", "After."];
    expect(exportRows(configName, source)).toEqual(expected);
    expect(layout(screenRows(configName, source))).toBe(layout(expected));
  });

  it.each([
    ["default", "LuauFunctionDefinitionThenCommentSharedLine", ["", "Shared."]],
    ["function identifiers", "LuauFunctionDefinitionThenCommentSharedLine", ["", "f4", "", "Shared."]],
    ["default", "SparkdownBlockCommentThenFunctionSharedLine", ["", "Shared."]],
    ["function identifiers", "SparkdownBlockCommentThenFunctionSharedLine", ["", "f3", "Shared."]],
    ["default", "LuauFunctionDefinitionPairSharedLine", ["", "Shared."]],
    ["function identifiers", "LuauFunctionDefinitionPairSharedLine", ["", "f5", "", "f6", "Shared."]],
  ] as const)("keeps every hidden part in order with %s settings: %s", (configName, kind, rows) => {
    const source = sourceOf([kind]);
    const expected = ["Before.", ...rows, "After."];
    expect(exportRows(configName, source)).toEqual(expected);
    expect(layout(screenRows(configName, source))).toBe(layout(expected));
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

import type { EditorView } from "@codemirror/view";
import { afterAll, describe, expect, it } from "vitest";
import type { ScreenplayConfig } from "../../sparkdown-screenplay/src/types/ScreenplayConfig";
import { isHiddenIdentifier } from "../../sparkdown-screenplay/src/utils/isHiddenIdentifier";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayPrintData } from "../../sparkdown-screenplay/src/utils/generateScreenplayPrintData";
import createEditorView from "../src/modules/screenplay-preview/utils/createEditorView";
import { setScreenplayConfig } from "../src/modules/screenplay-preview/utils/screenplaySettings";
import { settleParse } from "./helpers/parseSettle";
import { extractPdfText } from "./helpers/pdfText";

const KINDS: Record<string, string[]> = {
  AudioLine: ["  ((play music))"],
  BlockAction: ["  :", "    The door creaks."],
  BlockActionInnerBlank: ["  :", "    First.", "", "    Second."],
  BlockActionLeadingBlank: ["  :", "", "    First."],
  BlockDialogue: ["  GUIDE:", "    (softly)", "    Hello there."],
  BlockDialogueInnerBlank: ["  GUIDE:", "    First line.", "", "    Second line."],
  BlockHeading: ["  $:", "    INT. ROOM - DAY"],
  BlockHeadingInnerBlank: ["  $:", "    INT. A", "", "    INT. B"],
  BlockTitle: ["  ^:", "    THE END"],
  BlockTitleInnerBlank: ["  ^:", "    ONE", "    ", "    TWO"],
  BlockTransitional: ["  %:", "    CUT TO:"],
  BlockTransitionalInnerBlank: ["  %:", "    CUT", "", "    TO:"],
  BlockWrite: ["  @ hud:", "    Score up."],
  Branch: ["  branch b", "    Inside.", "  end"],
  Choice: ["  * [Stray.]"],
  ChoiceDivert: ["  * [Onward.] -> s"],
  ImplicitActionDivert: ["  They leave. -> s"],
  InlineDialogueDivert: ["  GUIDE: Bye. -> s"],
  ImplicitActionTag: ["  They go. # mood"],
  ChoiceTag: ["  * [Go.] # mood"],
  InlineDialogueTag: ["  GUIDE: Hi. # mood"],
  ImplicitActionImageMidLine: ["  They go. [[show bg x]] on."],
  ChoiceLineComment: ["  * [Go.] // note"],
  ImplicitActionGlue: ["  They go <>", "  on."],
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
  LuauFunctionDefinitionPairOnly: ["  function f7() end function f8() end"],
  LuauFunctionDefinitionThenCommentOnly: ["  function f9() end /* c */"],
  SparkdownBlockCommentThenFunctionOnly: ["  /* c */ function f10() end"],
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
  LuauSparkdownSingleLineConditionalAlternatorBlock: ["  match(x) | Small arm | Big arm end"],
  LuauSparkdownSingleLineSequentialAlternatorBlock: ["  queue | Arm one # t | Arm two end"],
  SingleLineCycleAlternator: ["  cycle | Cycle one. | Cycle two. end"],
  SingleLineShuffleAlternator: ["  shuffle | Shuffle one. | Shuffle two. end"],
  SingleLineAlternatorArmDivert: ["  queue | Leave now. -> s | Stay here. end"],
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

const PRINTED: Record<string, string[]> = {
  BlockAction: ["The door creaks."],
  BlockActionInnerBlank: ["First.", "Second."],
  BlockActionLeadingBlank: ["First."],
  BlockDialogue: ["GUIDE", "(softly)", "Hello there."],
  BlockDialogueInnerBlank: ["GUIDE", "First line.", "Second line."],
  BlockHeading: ["INT. ROOM - DAY"],
  BlockHeadingInnerBlank: ["INT. A", "INT. B"],
  BlockTitle: ["THE END"],
  BlockTitleInnerBlank: ["ONE", "TWO"],
  BlockTransitional: ["CUT TO:"],
  BlockTransitionalInnerBlank: ["CUT", "TO:"],
  Branch: ["Inside."],
  Choice: ["* [Stray.]"],
  ChoiceDivert: ["* [Onward.]"],
  ImplicitActionDivert: ["They leave."],
  InlineDialogueDivert: ["GUIDE", "Bye."],
  ImplicitActionTag: ["They go."],
  ChoiceTag: ["* [Go.]"],
  InlineDialogueTag: ["GUIDE", "Hi."],
  ImplicitActionImageMidLine: ["They go.", "on."],
  ChoiceLineComment: ["* [Go.]"],
  ImplicitActionGlue: ["They go", "on."],
  DualDialogue: ["GUIDE", "Left.", "VISITOR", "Right."],
  ImplicitAction: ["The door creaks."],
  InlineAction: ["The door creaks."],
  InlineDialogue: ["GUIDE", "Hello."],
  InlineHeading: ["INT. ROOM - DAY"],
  InlineTitle: ["THE END"],
  InlineTransitional: ["CUT TO:"],
  LuauFunctionDefinitionSharedLine: ["Same line."],
  LuauFunctionDefinitionThenCommentSharedLine: ["Shared."],
  SparkdownBlockCommentThenFunctionSharedLine: ["Shared."],
  LuauFunctionDefinitionPairSharedLine: ["Shared."],
  LuauSparkdownChooseBlock: ["* [Go.]", "They go."],
  LuauSparkdownConditionalAlternatorBlock: ["Small.", "Big."],
  LuauSparkdownDoBlock: ["It snows."],
  LuauSparkdownElseBlock: ["Yes."],
  LuauSparkdownElseifBlock: ["Maybe."],
  LuauSparkdownForLoop: ["Again."],
  LuauSparkdownIfBlock: ["It rains."],
  LuauSparkdownIfElseBlock: ["No.", "Yes."],
  LuauSparkdownRepeatLoop: ["It drizzles."],
  LuauSparkdownSequentialAlternatorBlock: ["First time.", "Second time."],
  LuauSparkdownSingleLineConditionalAlternatorBlock: ["Small arm", "Big arm"],
  LuauSparkdownSingleLineSequentialAlternatorBlock: ["Arm one", "Arm two"],
  SingleLineCycleAlternator: ["Cycle one.", "Cycle two."],
  SingleLineShuffleAlternator: ["Shuffle one.", "Shuffle two."],
  SingleLineAlternatorArmDivert: ["Leave now.", "Stay here."],
  LuauSparkdownWhileLoop: ["It hails."],
};

const compact = (text: string) => text.replace(/\s+/g, "");

const missingText = (rows: string[], expected: readonly string[]) => {
  const page = compact(rows.join(""));
  return expected.filter((text) => !page.includes(compact(text)));
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

const rowsOf = (view: EditorView): string[] => {
  const rows: string[] = [];
  for (const row of Array.from(view.contentDOM.children)) {
    if (isHidden(row, false)) continue;
    const text = visibleText(row);
    if (text.trim() && getComputedStyle(row).opacity !== "0") rows.push(text.trim());
    else if (text.length > 0 || row.querySelector("br")) rows.push("");
  }
  return rows;
};

const screenRows = (configName: string, source: string): string[] => {
  const view = show(configName, source);
  expect(view.contentDOM.querySelector(".cm-gap"), "every line rendered").toBeNull();
  return trimBlankRows(rowsOf(view));
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
        const missing = missingText(screen, kinds.flatMap((kind) => PRINTED[kind] ?? []));
        if (missing.length) {
          failures.push(`sequence ${index}: page lacks ${JSON.stringify(missing)}; kinds ${kinds.join(" > ")}`);
        }
      }
      expect(failures).toEqual([]);
    },
    600_000,
  );
});

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
    const expected = ["INT. ROOM - DAY", "", "Hero", "Again.", "Hero", "Hi.", "", "First one | Second one", "Third line", "Hero", "Multi."];
    const screen = screenRows("default", source);
    expect(layout(screen)).toBe(layout(expected));
    expect(layout(exportRows("default", source))).toBe(layout(expected));
    expect(screen.join("\n")).not.toMatch(/x\s*<\s*3|x\s*\+=\s*1|^\|/m);
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

describe("a single-line alternator", () => {
  it.each([
    ["at the top of a scene", ["  queue | Tea, please. | Coffee, please. end"]],
    ["inside an if", ["  if true then", "    queue | Tea, please. | Coffee, please. end", "  end"]],
    ["inside a choice", ["  choose", "    * [Go.]", "      queue | Tea, please. | Coffee, please. end", "  end"]],
  ] as const)("prints each branch on its own line, on the page as in the export, %s", (_where, lines) => {
    const source = ["scene s", "  Before.", ...lines, "  After.", "end", ""].join("\n");
    const printed = exportRows("default", source);
    expect(printed.filter((row) => row.endsWith("please."))).toEqual(["Tea, please.", "Coffee, please."]);
    const screen = screenRows("default", source);
    expect(layout(screen)).toBe(layout(printed));
    const view = views.get("default")!;
    const row = Array.from(view.contentDOM.children).find((element) => element.textContent?.includes("Tea, please."))!;
    expect(row.querySelectorAll(".sp-break")).toHaveLength(1);
    expect(visibleText(row)).not.toMatch(/queue|\||end/);
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

import type { EditorView } from "@codemirror/view";
import { afterAll, describe, expect, it } from "vitest";
import type { ScreenplayConfig } from "../../sparkdown-screenplay/src/types/ScreenplayConfig";
import { isHiddenIdentifier } from "../../sparkdown-screenplay/src/utils/isHiddenIdentifier";
import createEditorView from "../src/modules/screenplay-preview/utils/createEditorView";
import { settleParse } from "./helpers/parseSettle";
import { extractPdfText } from "./helpers/pdfText";

const ELEMENTS: Record<string, string[]> = {
  "scene heading": ["  $: INT. ROOM - DAY"],
  action: ["  The door creaks."],
  dialogue: ["  GUIDE:", "    Hello there."],
  parenthetical: ["  GUIDE:", "    (softly)", "    Hello."],
  "inline dialogue": ["  GUIDE: Hello."],
  transition: ["  %: CUT TO:"],
  title: ["  ^: THE END"],
  choice: ["  choose", "    * [Go.]", "      They go.", "  end"],
  condition: ["  if true then", "    It rains.", "  end"],
  "do block": ["  do", "    It snows.", "  end"],
  loop: ["  while false do", "    It hails.", "  end"],
  repeat: ["  repeat", "    It drizzles.", "  until true"],
  alternator: ["  queue", "    | First time.", "    | Second time.", "  end"],
  "one-line alternator": ["  queue | A # t | B end"],
  branch: ["  branch b", "    Inside.", "  end"],
  function: ["  function f()", "    Inner.", "  end"],
  divert: ["  -> s"],
  statement: ["  & x = 1"],
  variable: ["  local z = 3"],
  image: ["  [[show bg x]]"],
  comment: ["  // note"],
  "blank line": [""],
};

const CONFIG: ScreenplayConfig = { screenplay_print_title_page: false };

let view: EditorView | undefined;

afterAll(() => {
  const parent = view?.dom.parentElement;
  view?.destroy();
  parent?.remove();
});

const showSource = (source: string): EditorView => {
  if (!view) {
    const parent = document.body.appendChild(document.createElement("div"));
    parent.style.width = "800px";
    view = createEditorView(parent, {
      textDocument: { uri: "file:///main.sd", version: 1, text: source },
      config: CONFIG,
    });
  } else {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: source },
    });
  }
  settleParse(view);
  return view;
};

const sourceOf = (first: string, second: string) =>
  [
    "scene s",
    "  Before.",
    ...ELEMENTS[first]!,
    ...ELEMENTS[second]!,
    "  After.",
    "end",
    "",
  ].join("\n");

const visibleText = (element: Element): string => {
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return "";
  let text = "";
  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
    else if (node.nodeType === Node.ELEMENT_NODE) text += visibleText(node as Element);
  });
  return text;
};

const trimBlankRows = (rows: string[]) => {
  while (rows[0] === "") rows.shift();
  while (rows.at(-1) === "") rows.pop();
  return rows;
};

const screenRows = (source: string): string[] => {
  const rows: string[] = [];
  for (const row of Array.from(showSource(source).contentDOM.children)) {
    const style = getComputedStyle(row);
    if (style.display === "none" || style.visibility === "hidden") continue;
    if (row.querySelector("hr")) continue;
    const text = visibleText(row);
    if (text.trim()) rows.push(text.trim());
    else if (text.length > 0 || row.querySelector("br")) rows.push("");
  }
  return trimBlankRows(rows);
};

const exportRows = (source: string): string[] =>
  trimBlankRows(
    extractPdfText(source, CONFIG)
      .split("\n")
      .filter((row) => !isHiddenIdentifier(row.match(/^<(\w+)>/)?.[1], CONFIG))
      .map((row) => row.replace(/^<[^>]*> ?/, "").trim()),
  );

const shape = (rows: string[]) =>
  rows
    .map((row) => (row ? "text" : "blank"))
    .filter((kind, index, kinds) => kind === "blank" || kinds[index - 1] !== "text");

const compact = (rows: string[]) => rows.join("").replace(/\s+/g, "");

const PAIRS =Object.keys(ELEMENTS).flatMap((first) =>
  Object.keys(ELEMENTS).map((second) => [first, second] as const),
);

describe("screenplay page and export agree on blank lines", () => {
  it.each(PAIRS)("%s followed by %s", (first, second) => {
    const source = sourceOf(first, second);
    const screen = screenRows(source);
    const printed = exportRows(source);
    expect(
      shape(screen),
      `screen ${JSON.stringify(screen)} export ${JSON.stringify(printed)}`,
    ).toEqual(shape(printed));
    expect(compact(screen)).toBe(compact(printed));
  });

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
    const screen = screenRows(source);
    const index = screen.indexOf("More than you would like.");
    expect(screen.slice(index, index + 3)).toEqual([
      "More than you would like.",
      "",
      "* [Climb.]",
    ]);
  });
});

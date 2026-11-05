import {
  ensureSyntaxTree,
  foldEffect,
  foldedRanges,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { setDiagnostics } from "@codemirror/lint";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import {
  autoCloseBrackets,
  vscodeLanguage,
} from "@impower/codemirror-vscode-language/src";
import {
  documentHighlights,
  hoverPreviews,
  serverFolding,
} from "@impower/codemirror-vscode-lsp-client/src";
import CONFIG_DEFINITION from "@impower/sparkdown/language/sparkdown.language-config.json";
import { sparkdownGrammarFor } from "@impower/sparkdown/src/compiler/utils/sparkdownGrammarFor";
import { getStyleTags, tags, type Tag } from "@lezer/highlight";
import { afterEach, describe, expect, it } from "vitest";
import {
  highlightLines,
  setHighlights,
} from "../src/cm-highlight-lines/highlightLines";
import {
  CURRENT_LINE_CLASS_NAME,
  getRouteLineRuns,
  lineBands,
  ROUTE_CLASS_NAME,
} from "../src/cm-line-bands/lineBands";
import { problemMarks } from "../src/cm-problem-marks/problemMarks";
import {
  scriptAppearance,
  setScriptAppearance,
} from "../src/cm-script-appearance/scriptAppearance";
import type { ScriptAppearance } from "../src/cm-script-appearance/scriptAppearanceOptions";
import { isExecutionGap } from "../src/modules/script-editor/constants/EDITOR_EXTENSIONS";
import EDITOR_HIGHLIGHTS from "../src/modules/script-editor/constants/EDITOR_HIGHLIGHTS";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";
import {
  ALL_OFF_APPEARANCE,
  ALL_ON_APPEARANCE,
} from "./fixtures/scriptAppearance";

const SCRIPT = [
  "scene intro",
  "  MAYA:",
  "    Hello there.",
  "  Then *slowly*, **firmly** _now_.",
  "  // a quiet note",
  "  function go()",
  '    local s = "str"',
  "  end",
  "end",
  "layout main {",
  "  divider_line",
  "}",
].join("\n");

const language = vscodeLanguage({
  name: "sparkdown",
  grammar: sparkdownGrammarFor("file:///main.sd"),
  config: CONFIG_DEFINITION as never,
});

let view: EditorView | undefined;

const mount = (
  appearance: ScriptAppearance,
  doc = SCRIPT,
  extra: Extension[] = [],
) => {
  const parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        language,
        lineNumbers(),
        syntaxHighlighting(EDITOR_HIGHLIGHTS),
        scriptAppearance(appearance),
        highlightLines({ isGap: isExecutionGap }),
        lineBands(),
        problemMarks(),
        ...extra,
        EditorView.theme(EDITOR_THEME, { dark: true }),
      ],
    }),
    parent,
  });
  ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  view.dispatch({});
  return view;
};

const toggle = (
  from: ScriptAppearance,
  changes: Partial<ScriptAppearance>,
): ScriptAppearance => {
  const next = { ...from, ...changes };
  setScriptAppearance(view!, from, next);
  return next;
};

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

const textOffset = (text: string, nth = 0) => {
  let at = -1;
  for (let i = 0; i <= nth; i++) {
    at = SCRIPT.indexOf(text, at + 1);
  }
  expect(at, text).toBeGreaterThanOrEqual(0);
  return at;
};

const innermostAt = (pos: number): Element => {
  const { node, offset } = view!.domAtPos(pos + 1);
  const el =
    node.nodeType === Node.TEXT_NODE
      ? node.parentElement
      : ((node.childNodes[offset] as Element | undefined) ?? (node as Element));
  expect(el).toBeTruthy();
  return el!;
};

const styleAt = (text: string, property: string, nth = 0) =>
  getComputedStyle(innermostAt(textOffset(text, nth))).getPropertyValue(
    property,
  );

const nodeWithTag = (tag: Tag) => {
  let found: { from: number; to: number } | undefined;
  syntaxTree(view!.state).iterate({
    enter: (node) => {
      if (found) return false;
      if (getStyleTags(node)?.tags.includes(tag)) {
        found = { from: node.from, to: node.to };
        return false;
      }
      return undefined;
    },
  });
  expect(found).toBeTruthy();
  return found!;
};

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("speaker names and dialogue", () => {
  it("draw a speaker in --syntax-speaker and a quoted string in --syntax-string", () => {
    mount(ALL_OFF_APPEARANCE);
    expect(styleAt("MAYA", "color")).toBe("var(--syntax-speaker)");
    expect(styleAt("str", "color")).toBe("var(--syntax-string)");
  });

  it("draw dialogue in the untinted colour, and the dialogue colour under Tinted dialogue", () => {
    mount(ALL_OFF_APPEARANCE);
    expect(styleAt("Hello", "color")).toBe("var(--syntax-dialogue-untinted)");
    toggle(ALL_OFF_APPEARANCE, { tintedDialogue: true });
    expect(view!.dom.classList.contains("cm-tinted-dialogue")).toBe(true);
    expect(styleAt("Hello", "color")).toBe("var(--syntax-dialogue)");
    expect(styleAt("MAYA", "color")).toBe("var(--syntax-speaker)");
  });
});

describe("each appearance option toggles its rendering", () => {
  it("Bold declaration names bolds the declared names of a scene, a function and a layout", () => {
    mount(ALL_OFF_APPEARANCE);
    expect(view!.dom.querySelectorAll(".cm-role-declared")).toHaveLength(0);
    toggle(ALL_OFF_APPEARANCE, { boldDeclarationNames: true });
    const declared = [...view!.dom.querySelectorAll(".cm-role-declared")].map(
      (el) => el.textContent,
    );
    expect(declared).toEqual(["intro", "go", "main"]);
    expect(styleAt("intro", "font-weight")).toBe("bold");
  });

  it("Bold speaker names bolds the speaker", () => {
    mount(ALL_OFF_APPEARANCE);
    expect(styleAt("MAYA", "font-weight")).not.toBe("bold");
    toggle(ALL_OFF_APPEARANCE, { boldSpeakerNames: true });
    expect(styleAt("MAYA", "font-weight")).toBe("bold");
  });

  it("Bold container names bolds a component name", () => {
    mount(ALL_OFF_APPEARANCE);
    const container = nodeWithTag(tags.className);
    const weight = () =>
      getComputedStyle(innermostAt(container.from)).getPropertyValue(
        "font-weight",
      );
    expect(weight()).not.toBe("bold");
    toggle(ALL_OFF_APPEARANCE, { boldContainerNames: true });
    expect(weight()).toBe("bold");
  });

  it("Italic comments italicizes a comment", () => {
    mount(ALL_OFF_APPEARANCE);
    expect(styleAt("quiet", "font-style")).not.toBe("italic");
    toggle(ALL_OFF_APPEARANCE, { italicComments: true });
    expect(styleAt("quiet", "font-style")).toBe("italic");
  });

  it("Emphasize markup renders italic, bold and underline as the reader sees them", () => {
    mount(ALL_OFF_APPEARANCE);
    expect(styleAt("slowly", "font-style")).not.toBe("italic");
    expect(styleAt("firmly", "font-weight")).not.toBe("bold");
    expect(styleAt("now", "text-decoration")).not.toContain("underline");
    toggle(ALL_OFF_APPEARANCE, { emphasizeMarkup: true });
    expect(styleAt("slowly", "font-style")).toBe("italic");
    expect(styleAt("firmly", "font-weight")).toBe("bold");
    expect(styleAt("now", "text-decoration")).toContain("underline");
  });

  it("Line numbers shows and hides the numbers while keeping the gutter", () => {
    mount(ALL_OFF_APPEARANCE);
    const opacities = () =>
      [
        ...view!.dom.querySelectorAll(".cm-lineNumbers .cm-gutterElement"),
      ].map((el) => getComputedStyle(el).getPropertyValue("opacity"));
    expect(opacities().length).toBeGreaterThan(1);
    expect(new Set(opacities())).toEqual(new Set(["0"]));
    toggle(ALL_OFF_APPEARANCE, { lineNumbers: true });
    expect(view!.dom.classList.contains("cm-line-numbers")).toBe(true);
    expect(new Set(opacities().slice(1))).toEqual(new Set(["0.65"]));
    expect(view!.dom.querySelector(".cm-lineNumbers")).toBeTruthy();
  });

  it("Show indentation guides draws nothing, the caret's block, or every level", () => {
    const doc = ["scene a", "  if x", "    one", "    two", "  end", "end"].join(
      "\n",
    );
    mount(ALL_OFF_APPEARANCE, doc);
    view!.dispatch({ selection: { anchor: doc.indexOf("one") } });
    const guides = () =>
      [...view!.dom.querySelectorAll<HTMLElement>(".cm-indent-guides")].map(
        (el) => el.getAttribute("style") ?? "",
      );
    expect(guides()).toEqual([]);

    let appearance = toggle(ALL_OFF_APPEARANCE, { indentGuides: "block" });
    const block = guides();
    expect(block.length).toBeGreaterThan(0);
    for (const style of block) {
      expect(style).toContain("--indent-marker-active-bg-color");
      expect(style).not.toMatch(/--indent-marker-bg-color\)/);
    }

    appearance = toggle(appearance, { indentGuides: "all" });
    const all = guides();
    expect(all.some((s) => s.includes("--indent-marker-bg-color)"))).toBe(
      true,
    );
    expect(all.some((s) => s.includes("--indent-marker-active-bg-color"))).toBe(
      true,
    );
  });

  it("Highlight matching symbols, Hover previews and Auto-close brackets switch their facets", () => {
    mount(ALL_OFF_APPEARANCE);
    const facets = () => ({
      highlights: view!.state.facet(documentHighlights),
      hovers: view!.state.facet(hoverPreviews),
      close: view!.state.facet(autoCloseBrackets),
    });
    expect(facets()).toEqual({ highlights: false, hovers: false, close: false });
    toggle(ALL_OFF_APPEARANCE, {
      highlightMatchingSymbols: true,
      hoverPreviews: true,
      autoCloseBrackets: true,
    });
    expect(facets()).toEqual({ highlights: true, hovers: true, close: true });
  });

  it("Auto-close brackets closes a typed bracket only while turned on", () => {
    const type = (text: string) => {
      const { from, to } = view!.state.selection.main;
      const insert = () =>
        view!.state.update({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
      const handled = view!.state
        .facet(EditorView.inputHandler)
        .some((handler) => handler(view!, from, to, text, insert));
      if (!handled) view!.dispatch(insert());
    };
    mount(ALL_OFF_APPEARANCE, "scene a\n  \nend");
    const at = view!.state.doc.line(2).to;
    view!.dispatch({ selection: { anchor: at } });
    type("(");
    expect(view!.state.doc.line(2).text).toBe("  (");

    toggle(ALL_OFF_APPEARANCE, { autoCloseBrackets: true });
    view!.dispatch({
      changes: { from: at, to: at + 1 },
      selection: { anchor: at },
    });
    type("(");
    expect(view!.state.doc.line(2).text).toBe("  ()");
  });

  it("reconfigures only the options that changed", () => {
    mount(ALL_ON_APPEARANCE);
    let dispatched = 0;
    const original = view!.dispatch.bind(view!);
    view!.dispatch = ((...args: Parameters<EditorView["dispatch"]>) => {
      dispatched++;
      return original(...args);
    }) as EditorView["dispatch"];
    setScriptAppearance(view!, ALL_ON_APPEARANCE, { ...ALL_ON_APPEARANCE });
    expect(dispatched).toBe(0);
  });
});

describe("the route rule", () => {
  it("spans the lines it is given, joining blank and comment lines between them", async () => {
    const doc = [
      "scene a",
      "  one",
      "",
      "  // aside",
      "  two",
      "  three",
      "  four",
      "end",
    ].join("\n");
    mount(ALL_OFF_APPEARANCE, doc);
    setHighlights(view!, [2, 5, 6]);
    expect(getRouteLineRuns(view!.state)).toEqual([[2, 6]]);
    setHighlights(view!, [2, 6]);
    expect(getRouteLineRuns(view!.state)).toEqual([[2, 2], [6, 6]]);
    await nextFrame();
    const rules = view!.dom.querySelectorAll<HTMLElement>(
      `.cm-line-bands .${ROUTE_CLASS_NAME}`,
    );
    expect(rules).toHaveLength(2);
    for (const rule of rules) {
      expect(rule.style.width).toBe("3px");
    }
    const band = view!.dom.querySelector<HTMLElement>(
      `.cm-line-bands .${CURRENT_LINE_CLASS_NAME}`,
    );
    expect(band).toBeTruthy();
    expect(band!.compareDocumentPosition(rules[1]!)).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
  });

  it("runs unbroken from a scene's first executed line to dialogue under a speaker cue", () => {
    const doc = [
      "scene a",
      "  The room is cold.",
      "  INSPECTOR:",
      "    Where were you?",
      "  * [Lie.]",
      "    MAYA:",
      "      Home.",
      "end",
    ].join("\n");
    mount(ALL_OFF_APPEARANCE, doc);
    setHighlights(view!, [2, 4]);
    expect(getRouteLineRuns(view!.state)).toEqual([[2, 4]]);
    setHighlights(view!, [2, 4, 7]);
    expect(getRouteLineRuns(view!.state)).toEqual([
      [2, 4],
      [7, 7],
    ]);
  });

  it("is hidden in an empty script", () => {
    mount(ALL_OFF_APPEARANCE, "");
    setHighlights(view!, [1]);
    expect(getRouteLineRuns(view!.state)).toEqual([]);
  });
});

describe("problem marks", () => {
  it("mark each problem line with its worst severity, and colour its number while numbers show", () => {
    const doc = ["one", "two", "three"].join("\n");
    mount({ ...ALL_OFF_APPEARANCE, lineNumbers: true }, doc);
    view!.dispatch(
      setDiagnostics(view!.state, [
        { from: 0, to: 3, severity: "warning", message: "w" },
        { from: 1, to: 2, severity: "error", message: "e" },
        { from: 4, to: 7, severity: "info", message: "i" },
      ]),
    );
    const lines = view!.dom.querySelectorAll(".cm-line");
    expect(lines[0]!.classList.contains("cm-problem-line-error")).toBe(true);
    expect(lines[1]!.classList.contains("cm-problem-line-info")).toBe(true);
    expect(lines[2]!.classList.contains("cm-problem-line")).toBe(false);
    const numbered = view!.dom.querySelectorAll(
      ".cm-lineNumbers .cm-problem-gutter-error",
    );
    expect(numbered).toHaveLength(1);
    expect(getComputedStyle(numbered[0]!).getPropertyValue("color")).toBe(
      "var(--editor-problem-error)",
    );
    const range = view!.dom.querySelector(".cm-lintRange-error");
    expect(range).toBeTruthy();
    expect(getComputedStyle(range!).getPropertyValue("text-decoration-style")).toBe(
      "wavy",
    );
  });
});

describe("folded blocks", () => {
  it("show a chip with the hidden line count that unfolds on press", () => {
    const doc = ["scene a", "  one", "  two", "  three", "end"].join("\n");
    mount(ALL_OFF_APPEARANCE, doc, [serverFolding().editorExtension!]);
    const state = view!.state;
    view!.dispatch({
      effects: foldEffect.of({
        from: state.doc.line(1).to,
        to: state.doc.line(4).to,
      }),
    });
    const chip = view!.dom.querySelector<HTMLElement>(".cm-foldPlaceholder");
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toBe("3");
    expect(chip!.getAttribute("aria-label")).toContain("3 lines");
    chip!.click();
    expect(foldedRanges(view!.state).size).toBe(0);
  });
});

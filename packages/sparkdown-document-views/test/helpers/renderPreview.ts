// Mount the screenplay-formatting CodeMirror extension in a jsdom DOM and
// return the rendered HTML/text representation. Used by both the parity
// tests and the human-readable dump tool (renderToFile).
//
// What we get:
//   - real CodeMirror EditorView -> .cm-content DOM
//   - line-by-line breakdown with visible text + applied CSS classes
//   - per-line "is the line block-rendered but visually empty" detection
//     (catches the class of bug where inline-hidden content leaves a vertical
//     gap because the cm-line wrapper still occupies a line of height)
//
// What we *don't* get: pixel positions. jsdom has no layout engine, so we
// can't ask "how many pixels tall is this line." We rely on CSS class
// inspection ("does the line have display:none? are all its children
// visibility:hidden width:0?") to infer visible/invisible.

import { forceParsing, language } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  SCREENPLAY_LANGUAGE_SUPPORT,
  default as screenplayFormatting,
} from "../../src/modules/screenplay-preview/utils/screenplayFormatting";

export type RenderedLine = {
  index: number;
  /** outerHTML of the .cm-line element */
  html: string;
  /** plain text content of the line (after `replace` decorations are removed but BEFORE visibility CSS) */
  text: string;
  /** True iff every text child is inline-hidden via CSS (visibility:hidden + zero box). Indicates the "empty line that still takes vertical space" bug. */
  emptyButBlockRendered: boolean;
};

export type RenderResult = {
  contentHTML: string;
  lines: RenderedLine[];
};

// "Takes vertical space but is invisible" — the layout problem we're
// hunting. display:none removes the box entirely (no contribution to the
// parent's line-height), so that case is NOT a problem. visibility:hidden
// still creates a line-box and gives the parent line-height even when zero-
// sized horizontally — that's the case that produces visible gaps.
const TAKES_SPACE_INVISIBLY = (el: Element): boolean => {
  const cs = (el.ownerDocument!.defaultView as any).getComputedStyle(el);
  if (cs.display === "none") return false;
  if (cs.visibility === "hidden") return true;
  return false;
};

export const renderPreview = (source: string): RenderResult => {
  if (typeof document === "undefined") {
    throw new Error(
      "renderPreview requires a DOM. Set vitest environment: 'jsdom'.",
    );
  }
  const parent = document.createElement("div");
  parent.style.width = "800px";
  document.body.appendChild(parent);
  try {
    const view = new EditorView({
      state: EditorState.create({
        doc: source,
        extensions: [
          language.of(SCREENPLAY_LANGUAGE_SUPPORT.language),
          screenplayFormatting(),
        ],
      }),
      parent,
    });
    const content = parent.querySelector(".cm-content");
    const contentHTML = content ? content.outerHTML : "";
    const lines: RenderedLine[] = [];
    const lineEls = content
      ? Array.from(content.querySelectorAll(".cm-line"))
      : [];
    lineEls.forEach((lineEl, index) => {
      const text = lineEl.textContent ?? "";
      // Walk text-bearing children; if every one is hidden via CSS, the line
      // is empty-but-block-rendered.
      const textChildren: Element[] = [];
      lineEl.querySelectorAll("*").forEach((el) => {
        if (el.textContent && el.textContent.length > 0) textChildren.push(el);
      });
      const everyChildHidden =
        textChildren.length > 0 && textChildren.every(TAKES_SPACE_INVISIBLY);
      const hasOwnText = (lineEl.childNodes
        ? Array.from(lineEl.childNodes)
        : []
      ).some(
        (n: any) =>
          n.nodeType === 3 /* Text */ && (n.textContent ?? "").length > 0,
      );
      lines.push({
        index,
        html: lineEl.outerHTML,
        text,
        emptyButBlockRendered: everyChildHidden && !hasOwnText,
      });
    });
    view.destroy();
    return { contentHTML, lines };
  } finally {
    parent.remove();
  }
};

// Extract the text a reader actually SEES in the rendered preview, in
// document order, one entry per visible line.
//
// Unlike `extractPreviewText` (helpers/previewText.ts), which reconstructs
// visibility from `decorate()`'s source-range decorations, this walks the
// real rendered DOM and honours computed CSS (`display:none` /
// `visibility:hidden`). That matters because dialogue blocks render via a
// `DialogueWidget` whose DOM lives OUTSIDE the `.cm-line` elements and so is
// invisible to a source-range extractor — which is exactly why a missing
// vs. present dialogue can't be told apart by `extractPreviewText`. Use this
// when a test must assert that widget-rendered content (dialogue) actually
// shows, or that flow-block logic (conditions/diverts/labels) actually hides.
export const extractVisibleText = (source: string): string[] => {
  if (typeof document === "undefined") {
    throw new Error(
      "extractVisibleText requires a DOM. Set vitest environment: 'jsdom'.",
    );
  }
  const parent = document.createElement("div");
  parent.style.width = "800px";
  document.body.appendChild(parent);
  try {
    const state = EditorState.create({
      doc: source,
      extensions: [
        language.of(SCREENPLAY_LANGUAGE_SUPPORT.language),
        screenplayFormatting(),
      ],
    });
    const view = new EditorView({ state, parent });
    // Force a COMPLETE parse on the live view. A freshly-mounted EditorView
    // only gets whatever partial tree the parser produces synchronously within
    // its time budget — when cold, that can stop mid-document, leaving trailing
    // nodes (e.g. a scene-closing `end`) un-decorated and so leaking as raw
    // text. forceParsing finishes the parse AND updates the view, so the
    // decoration field recomputes from the full tree — making the rendered DOM
    // deterministic regardless of parser warm-up state.
    forceParsing(view, source.length, 30_000);
    const win = parent.ownerDocument!.defaultView as any;
    const visibleTextOf = (el: Element): string => {
      const cs = win.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return "";
      let out = "";
      el.childNodes.forEach((n: ChildNode) => {
        if (n.nodeType === 3 /* Text */) out += n.textContent ?? "";
        else if (n.nodeType === 1 /* Element */)
          out += visibleTextOf(n as Element);
      });
      return out;
    };
    const content = parent.querySelector(".cm-content");
    // `.cm-content`'s direct children are the per-line `.cm-line` elements
    // interleaved with block widgets (e.g. dialogue). Both are visible content
    // sources, so walk every child rather than only `.cm-line`.
    const lines = content
      ? Array.from(content.children)
          .map((el) => visibleTextOf(el).replace(/\s+/g, " ").trim())
          .filter((t) => t.length > 0)
      : [];
    view.destroy();
    return lines;
  } finally {
    parent.remove();
  }
};

// Format a RenderResult into a stable plain-text representation that's easy
// to diff and read in test snapshots / for human inspection.
export const formatRender = (r: RenderResult): string => {
  const out: string[] = [];
  out.push(`# ${r.lines.length} lines`);
  for (const line of r.lines) {
    const flag = line.emptyButBlockRendered ? " EMPTY-BUT-BLOCK" : "";
    out.push(`--- line ${line.index}${flag} ---`);
    out.push(`text: ${JSON.stringify(line.text)}`);
    out.push(`html: ${line.html}`);
  }
  return out.join("\n");
};

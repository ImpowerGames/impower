import { language } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  SCREENPLAY_LANGUAGE_SUPPORT,
  default as screenplayFormatting,
} from "../../src/modules/screenplay-preview/utils/screenplayFormatting";
import { settleParse } from "./parseSettle";

export type RenderedLine = {
  index: number;
  html: string;
  text: string;
  emptyButBlockRendered: boolean;
};

export type RenderResult = {
  contentHTML: string;
  lines: RenderedLine[];
};

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
    settleParse(view);
    const content = parent.querySelector(".cm-content");
    const contentHTML = content ? content.outerHTML : "";
    const lines: RenderedLine[] = [];
    const lineEls = content
      ? Array.from(content.querySelectorAll(".cm-line"))
      : [];
    lineEls.forEach((lineEl, index) => {
      const text = lineEl.textContent ?? "";
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
          n.nodeType === 3 && (n.textContent ?? "").length > 0,
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
    settleParse(view);
    const win = parent.ownerDocument!.defaultView as any;
    const visibleTextOf = (el: Element): string => {
      const cs = win.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return "";
      let out = "";
      el.childNodes.forEach((n: ChildNode) => {
        if (n.nodeType === 3) out += n.textContent ?? "";
        else if (n.nodeType === 1)
          out += visibleTextOf(n as Element);
      });
      return out;
    };
    const content = parent.querySelector(".cm-content");
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

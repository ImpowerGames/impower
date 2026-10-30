import { describe, expect, it } from "vitest";
import { language } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  SCREENPLAY_LANGUAGE_SUPPORT,
  default as screenplayFormatting,
} from "../src/modules/screenplay-preview/utils/screenplayFormatting";
import { settleParse } from "./helpers/parseSettle";

const FIXTURE_INDENTED_BLANK =
  `BUNNY:\n` + `  I-I know...\n` + `  \n` + `A beat.\n`;

const FIXTURE_EMPTY_BLANK =
  `BUNNY:\n` + `  I-I know...\n` + `\n` + `A beat.\n`;

const mountAndExtractCollapseLine = (
  source: string,
): { html: string; childKinds: string[]; hasText: boolean; hasBr: boolean } => {
  const parent = document.createElement("div");
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
    const lineEls = Array.from(
      view.dom.querySelectorAll(".cm-line"),
    ) as HTMLElement[];
    const collapseEl = lineEls.find((el) => el.classList.contains("collapse"));
    const html = collapseEl?.outerHTML ?? "";
    const childKinds: string[] = [];
    let hasText = false;
    let hasBr = false;
    if (collapseEl) {
      collapseEl.childNodes.forEach((n: any) => {
        if (n.nodeType === 3) {
          childKinds.push(`#text:${JSON.stringify(n.textContent)}`);
          if ((n.textContent ?? "").length > 0) hasText = true;
        } else if (n.nodeType === 1) {
          childKinds.push(n.nodeName.toLowerCase());
          if (n.nodeName === "BR") hasBr = true;
        } else {
          childKinds.push(`type:${n.nodeType}`);
        }
      });
    }
    view.destroy();
    return { html, childKinds, hasText, hasBr };
  } finally {
    parent.remove();
  }
};

describe("indented vs empty blank line — DOM shape parity", () => {
  it("indented blank: cm-line.collapse has whitespace text content (line-box anchored by text)", () => {
    const r = mountAndExtractCollapseLine(FIXTURE_INDENTED_BLANK);
    expect(
      r.html,
      "no .cm-line.collapse found for indented-blank fixture",
    ).not.toBe("");
    expect(
      r.hasText,
      `indented blank cm-line should contain whitespace text after Indent-replace is skipped; childKinds: ${JSON.stringify(r.childKinds)}; html: ${r.html}`,
    ).toBe(true);
  });

  it("empty blank: cm-line.collapse has a <br> (line-box anchored by br)", () => {
    const r = mountAndExtractCollapseLine(FIXTURE_EMPTY_BLANK);
    expect(
      r.html,
      "no .cm-line.collapse found for empty-blank fixture",
    ).not.toBe("");
    expect(
      r.hasBr,
      `empty blank cm-line should contain a <br> auto-injected by CodeMirror; childKinds: ${JSON.stringify(r.childKinds)}; html: ${r.html}`,
    ).toBe(true);
  });

  it("both produce a NON-collapsed line-box (text OR br anchor present)", () => {
    const indented = mountAndExtractCollapseLine(FIXTURE_INDENTED_BLANK);
    const empty = mountAndExtractCollapseLine(FIXTURE_EMPTY_BLANK);
    expect(indented.hasText || indented.hasBr).toBe(true);
    expect(empty.hasText || empty.hasBr).toBe(true);
  });
});

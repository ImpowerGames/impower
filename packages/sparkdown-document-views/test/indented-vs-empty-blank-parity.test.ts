// After the 2026-06-13 fix moved the "render-the-blank" responsibility
// from PREVIEW_THEME (`min-height: 1em` on `.cm-line.collapse`) to the
// decorator (skip Indent replace on whitespace-only lines), an indented
// blank line should produce a cm-line with NATURAL line-height — same as
// a truly-empty blank that CodeMirror auto-injects `<br>` into.
//
// This test pins both cases and asserts they render with the same
// effective height-producing shape: the indented blank has source
// whitespace as a text node (anchoring the line-box), the empty blank
// has a `<br>` (anchoring the line-box). Either way the cm-line should
// NOT be collapsed to zero height.
import { describe, expect, it } from "vitest";
import { language } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  SCREENPLAY_LANGUAGE_SUPPORT,
  default as screenplayFormatting,
} from "../src/modules/screenplay-preview/utils/screenplayFormatting";

// Indented blank line between dialogue and following action.
const FIXTURE_INDENTED_BLANK =
  `BUNNY:\n` + `  I-I know...\n` + `  \n` + `A beat.\n`;

// Same logical structure but the "blank" line has NO indent — i.e., a
// truly empty `\n`. This is what CodeMirror considers a real blank line.
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
          // Text node
          childKinds.push(`#text:${JSON.stringify(n.textContent)}`);
          if ((n.textContent ?? "").length > 0) hasText = true;
        } else if (n.nodeType === 1) {
          // Element
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

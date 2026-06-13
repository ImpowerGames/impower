// Regression for the user-reported bug (2026-06-13):
//
// "When a blank line after a dialogue is on the same indentation level
//  as the dialogue above it, the dialogue eats the blank separator
//  entirely. The blank line doesn't get rendered at all."
//
// User's reproducer:
//   `  \n  BUNNY:\n    I-I know...\n    \n  A beat.\n  \n`
//
// What was happening: the parser emits the separator and the formatter
// emits a `Decoration.line({class: "collapse"})`, so the DOM has
// `<div class="cm-line collapse">…</div>` between the dialogue and the
// action. But all of that line's children are `cm-widgetBuffer`
// (display:none) plus an empty span, and CodeMirror skips its `<br>`
// injection for lines that have decoration children. The base
// `.cm-line { opacity: 0; padding: 0 }` rule then leaves the line at
// effectively zero height — the user sees no blank line.
//
// Fix: PREVIEW_THEME now declares `min-height: 1em` on `.cm-line.collapse`
// so the standalone separator renders as a real blank line. The
// adjacent / first-child / last-child collapse rules reset `min-height: 0`
// so trailing / leading / doubled collapses stay hidden as before.

import { describe, expect, it } from "vitest";
import { language } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  SCREENPLAY_LANGUAGE_SUPPORT,
  default as screenplayFormatting,
} from "../src/modules/screenplay-preview/utils/screenplayFormatting";
import PREVIEW_THEME from "../src/modules/screenplay-preview/constants/PREVIEW_THEME";

const USER_FIXTURE = `  \n  BUNNY:\n    I-I know...\n    \n  A beat.\n  \n`;

describe("collapse separator visible height", () => {
  it("emits a `cm-line collapse` between the dialogue and the action", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    try {
      const view = new EditorView({
        state: EditorState.create({
          doc: USER_FIXTURE,
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
      const bunnyIdx = lineEls.findIndex((el) =>
        el.textContent?.includes("BUNNY"),
      );
      const beatIdx = lineEls.findIndex((el) =>
        el.textContent?.includes("A beat."),
      );
      expect(bunnyIdx).toBeGreaterThan(-1);
      expect(beatIdx).toBeGreaterThan(bunnyIdx);
      const between = lineEls.slice(bunnyIdx + 1, beatIdx);
      const collapse = between.find((el) =>
        el.classList.contains("collapse"),
      );
      expect(
        collapse,
        `expected a .cm-line.collapse between BUNNY block and "A beat.", got: ${JSON.stringify(between.map((el) => el.outerHTML))}`,
      ).toBeDefined();
      view.destroy();
    } finally {
      parent.remove();
    }
  });

  it("declares min-height on the standalone `.cm-line.collapse` selector", () => {
    // Verify the theme spec contains the rule. Asserting against the
    // theme object (not the live stylesheet) because style-mod's injected
    // sheets are not exposed via document.styleSheets in jsdom.
    const rule = (PREVIEW_THEME as Record<string, any>)["& .cm-line.collapse"];
    expect(
      rule,
      `expected PREVIEW_THEME to declare "& .cm-line.collapse"; keys: ${JSON.stringify(Object.keys(PREVIEW_THEME))}`,
    ).toBeDefined();
    expect(rule.minHeight).toBe("1em");
  });

  it("hide rules reset min-height so they win for edge / adjacent cases", () => {
    // The standalone rule's min-height:1em would otherwise leak through
    // (CSS computed height = max(min-height, height)). The hide rules
    // must explicitly reset min-height to 0 to suppress that.
    const theme = PREVIEW_THEME as Record<string, any>;
    const firstChild = theme["& .collapse:first-child"];
    const lastChild = theme["& .collapse:last-child"];
    const adjacent = theme["& .collapse + .collapse"];
    expect(firstChild.minHeight).toBe("0");
    expect(lastChild.minHeight).toBe("0");
    expect(adjacent.minHeight).toBe("0");
    // And height:0 + visibility:hidden remain so the box collapses fully.
    expect(firstChild.height).toBe("0");
    expect(firstChild.visibility).toBe("hidden");
  });
});

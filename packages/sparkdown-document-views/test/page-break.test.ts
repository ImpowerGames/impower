// Diagnostic + regression tests for the page-break decoration in the
// screenplay preview. Today the parser emits a "page_break" token at
// every Scene / Function / Knot (see ScreenplayParser.ts), and the
// preview renders those as a block <hr> widget (PageBreakWidget). This
// test pins that behavior so we don't regress it accidentally while
// scoping the future "show auto-pagination" toggle (which is deferred —
// no auto-pagination is implemented yet).

import { describe, expect, it } from "vitest";
import { renderPreview, formatRender } from "./helpers/renderPreview";
import { extractPdfText } from "./helpers/pdfText";
import { extractPreviewText } from "./helpers/previewText";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

describe("page break — explicit (Scene / Function / Knot) decoration", () => {
  // BlockHeading (`$:` prefix) does NOT create a Scene node and therefore
  // does NOT trigger the page-break widget. Per design discussion the
  // user accepts that the existing Scene/Function/Knot decorations
  // remain the only "explicit page breaks" today and `$:` headings stay
  // as inline section markers — see SCREENPLAY_PREVIEW.md.
  it("$:-prefixed scene heading renders inline (no <hr>), action lines intact", () => {
    const source =
      `Action before.\n` +
      `\n` +
      `$: INT. CASINO - NIGHT\n` +
      `\n` +
      `Action after.\n`;
    const r = renderPreview(source);
    const dir = resolve(__dirname, "snapshots");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, "page-break-block-heading.txt"),
      `## source\n${source}\n## render\n${formatRender(r)}\n` +
        `## pdf\n${extractPdfText(source)}\n` +
        `## preview\n${extractPreviewText(source)}\n`,
    );
    expect(r.contentHTML.includes("Action before.")).toBe(true);
    expect(r.contentHTML.includes("INT. CASINO - NIGHT")).toBe(true);
    expect(r.contentHTML.includes("Action after.")).toBe(true);
    expect(r.contentHTML.includes("<hr>")).toBe(false);
  });

  // The `scene <Name>` keyword form DOES create a Scene node, which the
  // preview replaces with a block <hr> widget (PageBreakWidget). This
  // test pins that behavior so the future "auto-pagination toggle" work
  // doesn't accidentally drop the explicit decoration.
  it("`scene` keyword form inserts an <hr> widget", () => {
    const source =
      `Action before.\n` +
      `\n` +
      `scene CasinoNight\n` +
      `  Bunny enters.\n` +
      `\n` +
      `Action after.\n`;
    const r = renderPreview(source);
    const dir = resolve(__dirname, "snapshots");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, "page-break-scene-keyword.txt"),
      `## source\n${source}\n## render\n${formatRender(r)}\n`,
    );
    expect(r.contentHTML.includes("Action before.")).toBe(true);
    expect(r.contentHTML.includes("Action after.")).toBe(true);
    expect(r.contentHTML.includes("<hr>")).toBe(true);
  });
});

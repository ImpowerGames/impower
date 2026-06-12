// User's actual pasted shape — cue lines are INDENTED (2 spaces), which
// means the dual dialogue lives inside a nesting context (knot stitch,
// branch, conditional block). The grammar parses indented cues
// differently from top-level cues. Reproduce that shape here.

import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { extractPreviewText } from "./helpers/previewText";
import { formatRender, renderPreview } from "./helpers/renderPreview";

// Wrap the user's exact text in a knot so cues legitimately appear with
// 2-space indent. (The exact wrapping doesn't matter — what matters is
// that the cues sit at column 2 instead of column 0.)
const FIXTURE =
  `== scene_a\n` +
  `  BUNNY:\n` +
  `    [[animate stage with shake]]\n` +
  `    ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
  `    I can do crime!!\n` +
  `\n` +
  `  RAFFLES [<]:\n` +
  `    B--\n` +
  `\n` +
  `  BUNNY [>]:\n` +
  `    [[animate stage with shake]]\n` +
  `    ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
  `    Would'ya QUIT Bunny-ing me??\n` +
  `    [[animate stage with shake]]\n` +
  `    ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
  `    I REFUSE TO BE 'BUNNY'-ED!!!\n` +
  `\n` +
  `  RAFFLES:\n` +
  `    Bunny, I asked if you wanted to movie hop once and you nearly had a panic attack.\n`;

describe("dual dialogue inside an indented (nested) block", () => {
  it("dual pair still renders when cue lines are indented", () => {
    const pdf = extractPdfText(FIXTURE);
    const preview = extractPreviewText(FIXTURE);
    const r = renderPreview(FIXTURE);
    const dir = resolve(__dirname, "snapshots");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, "dual-nested.txt"),
      `## fixture\n${FIXTURE}\n## pdf\n${pdf}\n## preview\n${preview}\n## rendered\n${formatRender(r)}\n`,
    );

    expect(r.contentHTML).toContain("B--");
    expect(r.contentHTML).toContain("Would'ya QUIT Bunny-ing me??");
    expect(r.contentHTML).toContain("I REFUSE TO BE 'BUNNY'-ED!!!");

    const OUTER_CM_LINE_OPACITY_1 =
      /^<div class="cm-line"[^>]*style="[^"]*\bopacity:\s*1\b/;
    const dualBearingLines = r.lines.filter(
      (l) =>
        l.html.includes("B--") ||
        l.html.includes("Would'ya QUIT") ||
        l.html.includes("I REFUSE"),
    );
    expect(dualBearingLines.length).toBeGreaterThan(0);
    for (const line of dualBearingLines) {
      expect(
        OUTER_CM_LINE_OPACITY_1.test(line.html),
        `dual cm-line ${line.index} has no opacity:1 on the OUTER cm-line — widget will be invisible.\nhtml: ${line.html.slice(0, 400)}`,
      ).toBe(true);
    }
  });
});

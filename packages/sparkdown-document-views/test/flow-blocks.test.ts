// Screenplay preview rendering for the Luau flow-block syntax
// (scene / choose / then / if…then / else / branch / do).
//
// The preview is grammar-driven: a decorator walks the lezer tree and hides
// logic while rendering screenplay content. The flow-block grammar nodes
// (LuauSparkdownChooseBlock, LuauSparkdownIfBlock, …) ship their bodies as
// ordinary nested Dialogue / Action / Choice nodes, so display content should
// render and the surrounding logic — keywords, conditions, divert targets,
// then-labels, bare `& …` statements — should all hide.
//
// We assert against the REAL rendered DOM (extractVisibleText) rather than the
// source-range extractPreviewText, because dialogue renders through a block
// widget whose DOM lives outside the `.cm-line` elements: a source-range
// extractor can't see it, so it can't distinguish "dialogue rendered" from
// "dialogue dropped". The fixtures mirror the compiler grammar fixtures under
// sparkdown/src/tests/compiler/__snapshots__/grammar/flow/.

import { describe, expect, it } from "vitest";
import { extractVisibleText } from "./helpers/renderPreview";

const joined = (source: string) => extractVisibleText(source).join("\n");

describe("screenplay preview — Luau flow blocks", () => {
  it("renders dialogue + choices inside a scene/choose block; hides divert targets", () => {
    // scene-with-choices-and-divert.sd
    const src =
      `scene Rooftop\n` +
      `  N: Do you see it?\n` +
      `  choose\n` +
      `    + [Courage.] -> WishCourage\n` +
      `    + [Answers.] -> WishAnswers\n` +
      `  end\n` +
      `end\n`;
    const text = joined(src);

    // Nested dialogue renders (via the dialogue widget).
    expect(text).toContain("Do you see it?");
    // Choice text renders.
    expect(text).toContain("[Courage.]");
    expect(text).toContain("[Answers.]");
    // Divert targets and the `choose`/`end` keywords are hidden.
    expect(text).not.toContain("WishCourage");
    expect(text).not.toContain("WishAnswers");
    expect(text).not.toMatch(/\bchoose\b/);
    expect(text).not.toMatch(/->/);
    expect(text).not.toMatch(/\bend\b/);
  });

  it("renders choices + then-clause action; hides the (label) and choose/then/end/done", () => {
    // scene-with-choose-then-block.sd
    const src =
      `scene main\n` +
      `  choose\n` +
      `    * Hi\n` +
      `    * Hey\n` +
      `  then (greeting)\n` +
      `    She nods.\n` +
      `  end\n` +
      `  done\n` +
      `end\n`;
    const text = joined(src);

    expect(text).toContain("Hi");
    expect(text).toContain("Hey");
    // then-clause body (action) renders.
    expect(text).toContain("She nods.");
    // then-label and flow keywords hide.
    expect(text).not.toContain("greeting");
    expect(text).not.toContain("(");
    expect(text).not.toMatch(/\bthen\b/);
    expect(text).not.toMatch(/\bchoose\b/);
    expect(text).not.toMatch(/\bdone\b/);
    expect(text).not.toMatch(/\bend\b/);
  });

  it("renders nested dialogue inside branch/if; hides condition and divert", () => {
    // branch-with-if-else-divert.sd
    const src =
      `scene Main\n` +
      `  branch AfterWish\n` +
      `    if trust >= 1 then\n` +
      `      N: Let's go.\n` +
      `      -> Alley\n` +
      `    else\n` +
      `      fin\n` +
      `    end\n` +
      `  end\n` +
      `end\n`;
    const text = joined(src);

    // Dialogue nested two levels deep (branch > if) renders.
    expect(text).toContain("Let's go.");
    // Condition, divert target, and keywords hide.
    expect(text).not.toContain("trust");
    expect(text).not.toMatch(/>=/);
    expect(text).not.toContain("Alley");
    expect(text).not.toMatch(/->/);
    expect(text).not.toMatch(/\bif\b/);
    expect(text).not.toMatch(/\bthen\b/);
    expect(text).not.toMatch(/\belse\b/);
    expect(text).not.toMatch(/\bfin\b/);
    expect(text).not.toMatch(/\bend\b/);
  });

  it("renders both if/else display branches; hides condition and bare & statement", () => {
    // scene-with-if-display.sd
    const src =
      `scene LoseTrust(c: companion)\n` +
      `  if c.trust == 0 then\n` +
      `    {c.name} doesn't trust you at all.\n` +
      `  else\n` +
      `    & c.trust -= 1\n` +
      `    {c.name} trusts you a little less...\n` +
      `  end\n` +
      `end\n`;
    const text = joined(src);

    // Both branches' action lines render (the preview shows all display
    // content; it does not evaluate the condition).
    expect(text).toContain("doesn't trust you at all.");
    expect(text).toContain("trusts you a little less...");
    // Condition, the `{c.name}` interpolation, and the bare `& …` assignment
    // all hide.
    expect(text).not.toContain("c.trust");
    expect(text).not.toContain("c.name");
    expect(text).not.toMatch(/==/);
    expect(text).not.toMatch(/-=/);
    expect(text).not.toMatch(/&/);
    expect(text).not.toMatch(/\bif\b/);
    expect(text).not.toMatch(/\belse\b/);
    expect(text).not.toMatch(/\bend\b/);
  });
});

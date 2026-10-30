import { describe, expect, it } from "vitest";
import { extractVisibleText } from "./helpers/renderPreview";

const joined = (source: string) => extractVisibleText(source).join("\n");

describe("screenplay preview — Luau flow blocks", () => {
  it("renders unmarked return prose and hides marked code in a nested story body", () => {
    const text = joined(`scene Main\n  if true then\n    return to the village\n    return 5\n    & return 9\n    & do if true then local hidden = 8 end end\n    After.\n  end\nend\n`);
    expect(text).toContain("return to the village");
    expect(text).toContain("return 5");
    expect(text).toContain("After.");
    expect(text).not.toContain("return 9");
    expect(text).not.toContain("hidden");
    expect(text).not.toContain("&");
  });

  it("renders dialogue + choices inside a scene/choose block; hides divert targets", () => {
    const src =
      `scene Rooftop\n` +
      `  N: Do you see it?\n` +
      `  choose\n` +
      `    + [Courage.] -> WishCourage\n` +
      `    + [Answers.] -> WishAnswers\n` +
      `  end\n` +
      `end\n`;
    const text = joined(src);

    expect(text).toContain("Do you see it?");
    expect(text).toContain("[Courage.]");
    expect(text).toContain("[Answers.]");
    expect(text).not.toContain("WishCourage");
    expect(text).not.toContain("WishAnswers");
    expect(text).not.toMatch(/\bchoose\b/);
    expect(text).not.toMatch(/->/);
    expect(text).not.toMatch(/\bend\b/);
  });

  it("renders choices + then-clause action; hides the (label) and choose/then/end/done", () => {
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
    expect(text).toContain("She nods.");
    expect(text).not.toContain("greeting");
    expect(text).not.toContain("(");
    expect(text).not.toMatch(/\bthen\b/);
    expect(text).not.toMatch(/\bchoose\b/);
    expect(text).not.toMatch(/\bdone\b/);
    expect(text).not.toMatch(/\bend\b/);
  });

  it("renders nested dialogue inside branch/if; hides condition and divert", () => {
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

    expect(text).toContain("Let's go.");
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

    expect(text).toContain("doesn't trust you at all.");
    expect(text).toContain("trusts you a little less...");
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

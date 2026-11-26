import { describe, expect, it } from "vitest";
import { complete as completeAt } from "./completionHarness";

const program = {
  context: {
    image: {
      forest: { $type: "image", $name: "forest" },
      "bunny-idle_2": { $type: "image", $name: "bunny-idle_2" },
      "raffles@night": { $type: "image", $name: "raffles@night" },
    },
    audio: { theme: { $type: "audio", $name: "theme" } },
  },
} as any;

const display = (line: string) => ["scene start", line, "  done", "end", ""].join("\n");

const choice = (line: string) =>
  ["scene start", "  choose", line, "      Body.", "      done", "  end", "end", ""].join("\n");

const labels = (source: string) =>
  completeAt(source.replace("|", "@0"), { program }).labels;

describe("an opener with no closer yet still offers directive completion (I-2423)", () => {
  it.each([
    ["before a word on a display line", display("  Hello [[sh|world"), "show"],
    ["at a display line's end", display("  Hello [[sh|"), "show"],
    ["right after the opener", display("  Hello [[|"), "show"],
    ["an image name", display("  Hello [[fo|"), "forest"],
    ["a name with a hyphen, underscore and digit", display("  Hello [[bunny-idle_|"), "bunny-idle_2"],
    ["in choice text", choice("    + Go [[sh| now"), "show"],
    ["inside a choice's brackets", choice("    + Go [[[sh|x] now"), "show"],
    ["an audio control", display("  Hello ((pl|world"), "play"],
    ["an audio name", display("  Hello ((th|"), "theme"],
    ["an audio control in choice text", choice("    + Go ((pl| now"), "play"],
  ])("%s: `%s` offers %s", (_label, source, expected) => {
    expect(labels(source)).toContain(expected);
  });

  it.each([
    ["after a space in the unclosed opener", display("  Hello [[show |")],
    ["after a later word", display("  Hello [[show forest |")],
    ["after a closed directive", display("  [[show forest]] and |")],
    ["after an attribute separator", display("  Hello [[forest:|")],
    ["after a second attribute separator", display("  Hello [[mia:hat:|world")],
    ["after a dot", display("  Hello ((theme.|")],
    ["after an attribute separator in choice text", choice("    + Go [[forest:| now")],
  ])("%s offers no directive keyword: `%s`", (_label, source) => {
    expect(labels(source)).not.toContain("show");
    expect(labels(source)).not.toContain("play");
  });

  it.each([
    ["a trailing at sign", "raffles@"],
    ["a completed at part", "raffles@night"],
    ["a partly typed at part", "raffles@ni"],
  ])("a name with %s offers what a closed pair offers there", (_label, name) => {
    const unclosed = labels(display(`  Hello [[${name}|`));
    expect(unclosed).toContain("raffles@night");
    expect(unclosed).toEqual(labels(display(`  Hello [[${name}|]]`)));
  });

  it("a closed pair still offers its completions", () => {
    expect(labels(display("  Hello [[sh|]]"))).toContain("show");
    expect(labels(display("  Hello ((pl|))"))).toContain("play");
  });
});

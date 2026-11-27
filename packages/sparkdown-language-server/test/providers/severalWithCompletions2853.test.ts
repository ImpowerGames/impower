import { describe, expect, it } from "vitest";
import { complete as completeAt } from "./completionHarness";

const program = {
  context: {
    image: { bunny: { $type: "image", $name: "bunny" } },
    video: { rain: { $type: "video", $name: "rain", src: "rain.webm" } },
  },
} as any;

const labels = (source: string) => completeAt(source.replace("|", "@0"), { program }).labels;

describe("a picture or screen line offers `with` again, and each `with` its own timing (I-2853)", () => {
  it.each([
    "[[animate portrait with shake |]]",
    "[[animate portrait with shake over 1s |]]",
    "[[show portrait bunny with fade |]]",
    "[[portrait bunny with fade |]]",
    "[[open menu with fade |]]",
    "[[animate portrait with shake w|]]",
  ])("`%s` offers `with`", (source) => {
    expect(labels(source)).toContain("with");
  });

  it("offers `over`, `after`, `ease`, `loop` and `once` after a second `with` when the first has them", () => {
    expect(labels("[[animate portrait with shake over 1s after 1s ease linear loop with spin |]]")).toEqual(
      expect.arrayContaining(["over", "after", "ease", "loop", "once"]),
    );
  });

  it("offers them for the line before its first `with` when only the `with` has them", () => {
    expect(labels("[[animate backdrop to left | with shake over 1s after 1s ease linear once]]")).toEqual(
      expect.arrayContaining(["over", "after", "ease", "loop", "once"]),
    );
  });

  it.each([
    ["[[animate portrait with shake over 1s |]]", "over"],
    ["[[animate portrait with shake over 1s with spin after 1s |]]", "after"],
    ["[[animate portrait over 1s | with shake]]", "over"],
    ["[[animate portrait with shake loop |]]", "loop"],
  ])("`%s` does not offer `%s` twice for one owner", (source, written) => {
    expect(labels(source)).not.toContain(written);
  });

  it("offers a word that belongs to the line once for the whole line", () => {
    expect(labels("[[animate portrait to left with shake |]]")).not.toContain("to");
    expect(labels("[[animate portrait wait with shake |]]")).not.toContain("wait");
  });

  it("`load` and `play` lines still offer `with` once", () => {
    expect(labels("[[play rain with fade |]]")).not.toContain("with");
    expect(labels("((play music theme with echo |))")).not.toContain("with");
  });
});

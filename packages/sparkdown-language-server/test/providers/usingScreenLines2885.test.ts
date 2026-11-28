import { describe, expect, it } from "vitest";
import { complete } from "./completionHarness";

const program = {
  context: {
    transition: { fade: { $type: "transition", $name: "fade" } },
    animation: { shake: { $type: "animation", $name: "shake" } },
  },
} as any;

const labels = (source: string) => complete(source.replace("|", "@0"), { program }).labels;

describe("completions offer `using` once on `open`, `close` and `navigate` (I-2885)", () => {
  it.each([
    "[[open menu |]]",
    "[[close menu |]]",
    "[[navigate main to menu |]]",
    "[[open menu with shake |]]",
    "[[close menu with shake over 1s |]]",
  ])("%s offers `using`", (source) => {
    expect(labels(source)).toContain("using");
  });

  it.each([
    "[[open menu using fade |]]",
    "[[close menu using fade with shake |]]",
    "[[navigate main to menu with shake using fade |]]",
  ])("%s offers no second `using`", (source) => {
    expect(labels(source)).not.toContain("using");
  });

  it.each(["[[open menu using |]]", "[[close menu using |]]", "[[navigate main to menu using |]]"])(
    "%s lists only transitions",
    (source) => {
      const offered = labels(source);
      expect(offered).toContain("fade");
      expect(offered).not.toContain("shake");
    },
  );

  it("offers the line's `over`, `after` and `ease` after the transition's name", () => {
    expect(labels("[[open menu using fade |]]")).toEqual(expect.arrayContaining(["over", "after", "ease"]));
  });
});

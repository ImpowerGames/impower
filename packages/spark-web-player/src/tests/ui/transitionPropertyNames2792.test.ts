import { describe, expect, test } from "vitest";
import { getCssEquivalent } from "../../../../sparkle-style-transformer/src/utils/getCssEquivalent";

const css = (key: string, value: string) => getCssEquivalent(key, value, {});

describe("Sparkle names in transition lists reach the page as CSS names", () => {
  test("transition-property maps every listed Sparkle name", () => {
    expect(css("transition_property", "pivot")).toEqual([["transition-property", "transform-origin"]]);
    expect(css("transition_property", "opacity, pivot")).toEqual([
      ["transition-property", "opacity, transform-origin"],
    ]);
    expect(css("transition_property", "opacity,pivot")).toEqual([
      ["transition-property", "opacity,transform-origin"],
    ]);
  });

  test("transition-property keeps names with no Sparkle mapping", () => {
    expect(css("transition_property", "opacity, scale, layout")).toEqual([
      ["transition-property", "opacity, scale, layout"],
    ]);
    expect(css("transition_property", "inherit")).toEqual([["transition-property", "inherit"]]);
  });

  test("transition shorthand maps the property name in each segment", () => {
    expect(css("transition", "pivot 1s")).toEqual([["transition", "transform-origin 1s"]]);
    expect(css("transition", "opacity 200ms ease-in, pivot 1s cubic-bezier(0.1, 0.2, 0.3, 1) 50ms")).toEqual([
      ["transition", "opacity 200ms ease-in, transform-origin 1s cubic-bezier(0.1, 0.2, 0.3, 1) 50ms"],
    ]);
  });
});

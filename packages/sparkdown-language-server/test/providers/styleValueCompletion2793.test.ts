import { describe, expect, test } from "vitest";
import { complete } from "./completionHarness";

const program = {
  context: {
    style: {
      $schema: {
        $type: "style",
        $name: "$schema",
        transition_property: ["opacity", "layout"],
        "transition-property": ["opacity", "layout"],
        "transition-easing": ["ease", "linear"],
      },
    },
  },
} as any;

const labelsAt = (line: string) =>
  complete(`style card {\n  ${line}\n}\n`, { program }).labels;

describe("style value completion (I-2793)", () => {
  test("an empty value offers the whole list with bare labels", () => {
    expect(labelsAt("transition-property = @1")).toEqual(expect.arrayContaining(["opacity", "layout"]));
    expect(labelsAt("transition-property = @1")).toHaveLength(2);
  });

  test("a partial word offers the values it can complete", () => {
    expect(labelsAt("transition-property = la@1")).toContain("layout");
    expect(labelsAt("transition-easing = li@1")).toContain("linear");
  });

  test("after a comma the values not yet listed are offered", () => {
    expect(labelsAt("transition-property = opacity, @1")).toEqual(["layout"]);
    expect(labelsAt("transition-property = opacity, la@1")).toEqual(["layout"]);
  });

  test("labels carry no leading space when completion is triggered by the equals sign", () => {
    const { items } = complete("style card {\n  transition-easing =@1\n}\n", { program, trigger: "=" });
    expect(items.map((item) => item.label)).toEqual(expect.arrayContaining(["ease", "linear"]));
    expect(items.find((item) => item.label === "ease")?.insertText).toBe(" ease");
  });
});

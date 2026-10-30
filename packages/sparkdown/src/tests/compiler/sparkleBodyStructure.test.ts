import { describe, expect, test } from "vitest";
import { compileSource } from "./compileSnapshot";

function layouts(source: string): any {
  const entries = compileSource(source);
  return entries.find((e) => e.block?.sparkle?.layouts)?.block?.sparkle?.layouts;
}

describe("an inline custom property", () => {
  test("parses, and does not swallow the props after it", () => {
    const props =
      layouts(`layout main with
  row #--my-var=4 #gap=12 {
    text "x"
  }
end
`)?.main?.children?.[0]?.props ?? {};
    expect(Object.keys(props).sort()).toEqual(["--my-var", "gap"]);
  });
});

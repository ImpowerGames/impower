import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      } as any,
    ],
  });
  return compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
};

const SORTED = "bunny_suspicious~look_left~phone";

describe("implicit filtered_image is created regardless of a trailing clause", () => {
  test("a filtered asset with NO clause creates the implicit filtered_image", () => {
    const result = compile(`-> main

scene main
  [[bunny_suspicious~phone~look_left]]
  done
end
`);
    const images = result.program.context?.["filtered_image"] ?? {};
    expect(Object.keys(images)).toContain(SORTED);
  });

  test("a filtered asset WITH a `with` clause still creates the SAME clean key", () => {
    // Regression: the `AssetCommandName` node greedily includes the trailing
    // space before the clause, so the last filter used to become "look_left ",
    // producing a mismatched `bunny_suspicious~look_left ~phone` key (note the
    // space) that never matched the reference's `sortFilteredName` key — the
    // image "could not be found" whenever a clause like `with flip` followed.
    const result = compile(`-> main

define flip as animation with
  keyframes = {
    transform = "scaleX(-1)"
  }
end

scene main
  [[bunny_suspicious~phone~look_left with flip]]
  done
end
`);
    const images = result.program.context?.["filtered_image"] ?? {};
    const bunnyKeys = Object.keys(images).filter((k) =>
      k.startsWith("bunny_suspicious"),
    );
    // Exactly the clean, space-free key — and no spaced variant.
    expect(bunnyKeys).toEqual([SORTED]);
    expect(bunnyKeys.some((k) => k.includes(" "))).toBe(false);
  });
});

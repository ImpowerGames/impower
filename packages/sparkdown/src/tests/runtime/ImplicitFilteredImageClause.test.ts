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

const CANONICAL = "bunny_suspicious~phone~look.left";

describe("implicit filtered_image is created regardless of a trailing clause", () => {
  test("a filtered asset with NO clause creates the implicit filtered_image", () => {
    const result = compile(`-> main

scene main
  [[bunny_suspicious:phone:look.left]]
  done
end
`);
    const images = result.program.context?.["filtered_image"] ?? {};
    expect(Object.keys(images)).toContain(CANONICAL);
    expect(images[CANONICAL].attributes).toEqual(["phone", "look.left"]);
  });

  test("a filtered asset WITH a `with` clause still creates the SAME clean key", () => {
    // Regression: the `AssetCommandName` node greedily includes the trailing
    // space before the clause, so the last attribute used to gain a space,
    // producing a mismatched `bunny_suspicious~phone~look.left ` key (note the
    // space) that never matched the reference's `sortFilteredName` key — the
    // image "could not be found" whenever a clause like `with flip` followed.
    const result = compile(`-> main

define flip as animation with
  keyframes = {
    transform = "scaleX(-1)"
  }
end

scene main
  [[bunny_suspicious~phone~look.left with flip]]
  done
end
`);
    const images = result.program.context?.["filtered_image"] ?? {};
    const bunnyKeys = Object.keys(images).filter((k) =>
      k.startsWith("bunny_suspicious"),
    );
    // Exactly the clean, space-free key — and no spaced variant.
    expect(bunnyKeys).toEqual([CANONICAL]);
    expect(bunnyKeys.some((k) => k.includes(" "))).toBe(false);
  });
});

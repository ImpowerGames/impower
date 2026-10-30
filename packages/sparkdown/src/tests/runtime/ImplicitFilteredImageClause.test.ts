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
    expect(bunnyKeys).toEqual([CANONICAL]);
    expect(bunnyKeys.some((k) => k.includes(" "))).toBe(false);
  });
});

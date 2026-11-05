import { describe, expect, test } from "vitest";
import { MAIN_URI, programCompiler } from "@impower/sparkdown/src/tests/program/programHarness";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getDocumentColors } from "../../utils/providers/getDocumentColors";

const nest = (d: number) => {
  let value = "var(--accent)";
  for (let i = 1; i < d; i++) value = `var(--accent,${value})`;
  return value;
};

const colorsOf = (value: string) => {
  const text = `layout first { text #--colors=${value} }\nscene start\nHi.\nend\n`;
  const { program } = programCompiler({ [MAIN_URI]: text }).compile();
  const docs = new SparkdownDocumentRegistry(["colors"]);
  docs.set({ textDocument: { uri: MAIN_URI, text, languageId: "sparkdown", version: 1 } });
  const doc = docs.get(MAIN_URI)!;
  const errors = Object.values(program.diagnostics ?? {}).flat().filter((x: any) => x.severity === 1);
  return { errors, colors: getDocumentColors(doc, docs.annotations(MAIN_URI), program).map((c) => doc.getText(c.range)) };
};

describe("a color at the start of a prop value with parentheses keeps its swatch", () => {
  test.each([
    ["a hex color", (d: number) => `#f00,${nest(d)}`, () => "#f00"],
    ["a long hex color", (d: number) => `#ff0000aa,${nest(d)}`, () => "#ff0000aa"],
    ["an rgb color, read to its own closer", (d: number) => `rgb(255,0,0),${nest(d)}`, () => "rgb(255,0,0)"],
    ["an hsla color, read to its own closer", (d: number) => `hsla(0,100%,50%,1),${nest(d)}`, () => "hsla(0,100%,50%,1)"],
  ])("%s at depth 1 and depth 7", (_, value, swatch) => {
    for (const d of [1, 7]) {
      const { errors, colors } = colorsOf(value(d));
      expect(errors, `depth ${d}`).toEqual([]);
      expect(colors, `depth ${d}`).toEqual([swatch(d)]);
    }
  });

  test("a value that is only a color still has its swatch", () => {
    expect(colorsOf("rgb(255,0,0)").colors).toEqual(["rgb(255,0,0)"]);
    expect(colorsOf("#f00").colors).toEqual(["#f00"]);
  });
});

import { beforeAll, describe, expect, test } from "vitest";
import { MAIN_URI, programCompiler } from "@impower/sparkdown/src/tests/program/programHarness";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getDocumentColors } from "../../utils/providers/getDocumentColors";

const swatchesOf = (word: string) => {
  const text = `style first {\n  @variant(${word}) { text-size = 32px }\n}\nscene start\nHi.\nend\n`;
  const { program } = programCompiler({ [MAIN_URI]: text }).compile();
  const docs = new SparkdownDocumentRegistry(["colors"]);
  docs.set({ textDocument: { uri: MAIN_URI, text, languageId: "sparkdown", version: 1 } });
  const doc = docs.get(MAIN_URI)!;
  return getDocumentColors(doc, docs.annotations(MAIN_URI), program).map((c) => [doc.getText(c.range), c.color]);
};

describe("a style condition word that names an inherited Object member gets no swatch", () => {
  beforeAll(() => {
    swatchesOf("red");
  }, 60000);

  test.each(["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"])("%s", (word) => {
    expect(swatchesOf(word)).toEqual([]);
  });

  test("a color table key keeps its swatch", () => {
    const swatches = swatchesOf("red");
    expect(swatches.map(([w]) => w)).toEqual(["red"]);
    expect((swatches[0]![1] as { red: number }).red).toBeGreaterThan(0.5);
  });
});

import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { describe, expect, it } from "vitest";
import { LAYOUT_CONTROL_DESCRIPTIONS } from "../../utils/providers/layoutControlDescriptions";
import { getHover } from "../../utils/providers/getHover";
import { complete } from "./completionHarness";

const LAYOUT_VERBS: string[] =
  (GRAMMAR_DEFINITION as any).variables.LAYOUT_CONTROL_KEYWORDS;

let version = 0;

const hoverAt = async (text: string, index: number) => {
  const uri = `file:///layoutVerb${++version}.sd`;
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri, text, version, languageId: "sparkdown" } });
  const document = documents.get(uri)!;
  const hover = await getHover(
    document,
    documents.tree(uri),
    documents.annotations(uri),
    undefined,
    undefined,
    document.positionAt(index),
  );
  if (!hover) {
    return null;
  }
  return {
    value: (hover.contents as { value: string }).value,
    marked: document.getText(hover.range),
  };
};

describe("layout verb help (#1991)", () => {
  it("the grammar's layout verbs are open, close, navigate and clear, and each has a description", () => {
    expect(LAYOUT_VERBS).toEqual(["open", "close", "navigate", "clear"]);
    for (const verb of LAYOUT_VERBS) {
      expect(LAYOUT_CONTROL_DESCRIPTIONS[verb], verb).toBeTruthy();
    }
    expect(Object.keys(LAYOUT_CONTROL_DESCRIPTIONS).sort()).toEqual(
      [...LAYOUT_VERBS].sort(),
    );
  });

  it("offers every layout verb after [[, each documented with its description", () => {
    const at = complete("[[@0]]");
    for (const verb of LAYOUT_VERBS) {
      const item = at.items.find((i) => i.label === verb);
      expect(item, verb).toBeDefined();
      expect((item!.documentation as { value: string }).value).toBe(
        LAYOUT_CONTROL_DESCRIPTIONS[verb],
      );
    }
  });

  it("hover on clear shows its description over the verb", async () => {
    const text = "scene start\n  [[clear textstream]]\nend\n";
    const hover = await hoverAt(text, text.indexOf("clear") + 2);
    expect(hover?.value).toBe(LAYOUT_CONTROL_DESCRIPTIONS["clear"]);
    expect(hover?.marked).toBe("clear");
  });

  it("hover on open, close and navigate shows each one's description", async () => {
    for (const [line, verb] of [
      ["[[open hud]]", "open"],
      ["[[close hud]]", "close"],
      ["[[navigate menu to settings]]", "navigate"],
    ] as const) {
      const text = `scene start\n  ${line}\nend\n`;
      const hover = await hoverAt(text, text.indexOf(verb) + 1);
      expect(hover?.value, verb).toBe(LAYOUT_CONTROL_DESCRIPTIONS[verb]);
      expect(hover?.marked, verb).toBe(verb);
    }
  });

  it("hover on an image verb is not a layout description", async () => {
    const text = "scene start\n  [[show bunny]]\nend\n";
    const hover = await hoverAt(text, text.indexOf("show") + 1);
    expect(Object.values(LAYOUT_CONTROL_DESCRIPTIONS)).not.toContain(
      hover?.value,
    );
  });
});

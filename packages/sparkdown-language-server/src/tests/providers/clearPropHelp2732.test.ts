import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getHover } from "../../utils/providers/getHover";
import { accept, completeAt } from "./braceCompletionHarness";

let version = 0;

const hoverAt = async (text: string, needle: string) => {
  const uri = `file:///clear${++version}.sd`;
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri, text, version, languageId: "sparkdown" } });
  const document = documents.get(uri)!;
  const hover = await getHover(
    document,
    documents.tree(uri),
    documents.annotations(uri),
    undefined,
    undefined,
    document.positionAt(text.indexOf(needle) + 1),
  );
  if (!hover) {
    return null;
  }
  return {
    value: (hover.contents as { value: string }).value,
    marked: document.getText(hover.range),
  };
};

describe("#clear in the editor (I-2732)", () => {
  test.each([
    "portrait #|",
    "portrait #cl|",
    "portrait #| { image }",
    "portrait.left #gap=4 #cl| { image }",
  ])("completion offers clear after # on a layout element: %s", (head) => {
    const source = `layout main {\n  stage {\n    ${head}\n  }\n}\n`;
    const item = completeAt(source, undefined, "#").find((i) => i.label === "clear");
    expect(item).toBeDefined();
    const result = accept(source, item!);
    expect(result.text).toBe(source.replace(/#\w*\|/, "#clear"));
  });

  test("completion does not offer clear after # outside a layout", () => {
    const source = "component card {\n  portrait #|\n}\n";
    expect(completeAt(source, undefined, "#").map((i) => i.label)).not.toContain("clear");
  });

  test("hover over #clear describes when the element empties", async () => {
    const source = "layout main {\n  stage {\n    portrait #clear { image }\n  }\n}\n";
    const hover = await hoverAt(source, "clear");
    expect(hover?.marked).toBe("#clear");
    expect(hover?.value).toContain("lasts as long as the line that put it there");
    expect(hover?.value).toContain("Without `#clear`");
  });

  test("hover over another prop is not the #clear description", async () => {
    const source = "layout main {\n  stage {\n    portrait #gap=4 { image }\n  }\n}\n";
    const hover = await hoverAt(source, "gap");
    expect(hover?.value ?? "").not.toContain("lasts as long as the line");
  });
});

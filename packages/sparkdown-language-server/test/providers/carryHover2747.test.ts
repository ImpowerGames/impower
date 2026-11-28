import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getHover } from "../../src/utils/providers/getHover";

let version = 0;

const hoverAt = async (text: string, index: number) => {
  const uri = `file:///carry${++version}.sd`;
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

describe("`>>` hover (I-2747)", () => {
  it("describes a `>>` that ends a line, on either `>`, and links the guide", async () => {
    const text = "RAFFLES: meet me outside >>";
    for (const index of [text.length - 2, text.length - 1]) {
      const hover = await hoverAt(text, index);
      expect(hover?.value).toContain("carries on without a click");
      expect(hover?.value).toContain("skips the stream's `pause`");
      expect(hover?.value).toContain("docs/guide/JoiningLines.md#133-carrying-on-without-a-click");
      expect(hover?.marked).toBe(">>");
    }
  });

  it("describes a `>>` followed by a tag", async () => {
    const hover = await hoverAt("She waits >> # pause", 10);
    expect(hover?.marked).toBe(">>");
  });

  it("describes a `..` before a `>>` as carrying on with no click", async () => {
    const hover = await hoverAt("Hold on .. >>\n.. tight.", 8);
    expect(hover?.value).toContain("before a `>>`");
    expect(hover?.marked).toBe("..");
  });

  it("gives no hover to two `>` in the middle of a line", async () => {
    expect(await hoverAt("Wait >> there.", 5)).toBeNull();
  });
});

import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getHover } from "../../utils/providers/getHover";

let version = 0;

// The hover's text, or null, with the cursor on the `..` at `index` in `text`.
const hoverAt = async (text: string, index: number) => {
  const uri = `file:///glue${++version}.sd`;
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
  const contents = hover.contents as { value: string };
  return {
    value: contents.value,
    marked: document.getText(hover.range),
  };
};

describe("glue mark hover", () => {
  it("explains a `..` that ends a line and links the guide", async () => {
    const hover = await hoverAt("You see a ..\n.. rusty key.", 10);
    expect(hover?.value).toContain("at the end of a line joins the next line");
    expect(hover?.value).toContain("docs/guide/JoiningLines.md");
    expect(hover?.marked).toBe("..");
  });

  it("explains a `..` that begins a line, on either dot", async () => {
    for (const index of [13, 14]) {
      const hover = await hoverAt("You see a ..\n.. rusty key.", index);
      expect(hover?.value).toContain("at the start of a line joins this line");
      expect(hover?.marked).toBe("..");
    }
  });

  it("explains a `..` that begins a line after a dialogue cue", async () => {
    const hover = await hoverAt("ALICE: .. It's me.", 7);
    expect(hover?.value).toContain("at the start of a line joins this line");
  });

  it("explains the marks on each side of a `>` break", async () => {
    const text = "Hold on .. > .. tight.";
    expect((await hoverAt(text, 8))?.value).toContain("before a `>` break");
    expect((await hoverAt(text, 13))?.value).toContain("after a `>` break");
  });

  it("gives no hover to a `..` that is text", async () => {
    expect(await hoverAt("a..b", 1)).toBeNull();
    expect(await hoverAt("{x} .. more", 4)).toBeNull();
    expect(await hoverAt("Some {x} .. more", 9)).toBeNull();
    expect(await hoverAt("Wait...", 4)).toBeNull();
  });

  it("gives no hover to a `..` that ends a line after a break", async () => {
    expect(await hoverAt("A > ..", 4)).toBeNull();
  });

  it("gives no hover to the spaces before a mark", async () => {
    expect(await hoverAt("You see a    ..\nnext", 10)).toBeNull();
  });
});

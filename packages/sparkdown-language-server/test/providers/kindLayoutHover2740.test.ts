import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getHover } from "../../src/utils/providers/getHover";

let version = 0;

const hoverAt = async (text: string, needle: string, from = 0) => {
  const uri = `file:///kinds${++version}.sd`;
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri, text, version, languageId: "sparkdown" } });
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri, type: "script", name: "main", ext: "sd", text, version, languageId: "sparkdown" }] as never,
  });
  const program = compiler.compile({ textDocument: { uri } }).program;
  const document = documents.get(uri)!;
  const hover = await getHover(
    document,
    documents.tree(uri),
    documents.annotations(uri),
    program,
    undefined,
    document.positionAt(text.indexOf(needle, from) + 1),
  );
  if (!hover) {
    return null;
  }
  return {
    value: (hover.contents as { value: string }).value,
    marked: document.getText(hover.range),
  };
};

describe("hover on a layout named after a kind of text (I-2740)", () => {
  it("says a built-in kind's layout opens by itself and what closes it", async () => {
    const text = "screen box {\n  slot\n}\n\nlayout dialogue in box {\n  dialogue { text }\n}\n";
    const hover = await hoverAt(text, "dialogue in");
    expect(hover?.marked).toBe("dialogue");
    expect(hover?.value).toContain("opens by itself");
    expect(hover?.value).toContain("A dialogue line opens it when no open layout holds an element named `dialogue`");
    expect(hover?.value).toContain("closes when the next line belongs in a different layout");
  });

  it("names the @name: line for an author's own kind", async () => {
    const text = "layout note {\n  paper {\n    note { text }\n  }\n}\n";
    const hover = await hoverAt(text, "note {");
    expect(hover?.marked).toBe("note");
    expect(hover?.value).toContain("A line written with `@note:` opens it");
  });

  it("says nothing on a layout that holds no element of its own name", async () => {
    const text = "layout hud {\n  meter { text \"HP\" }\n}\n";
    const hover = await hoverAt(text, "hud");
    expect(hover?.value ?? "").not.toContain("opens by itself");
  });
});

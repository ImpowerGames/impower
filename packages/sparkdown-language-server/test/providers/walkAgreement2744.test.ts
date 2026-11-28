import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getHover } from "../../src/utils/providers/getHover";
import { compileProject } from "./completionHarness";

const URI = "file:///proj/main.sd";

const NOTE_CASES: [string, string, boolean][] = [
  ["an element in the layout", "layout note {\n  note { text }\n}", true],
  ["an element in the layout's screen body", "screen paper {\n  note { text }\n  slot\n}\n\nlayout note in paper {\n  margin\n}", true],
  ["an element in a component", "component memo {\n  note { text }\n}\n\nlayout note {\n  memo\n}", true],
  ["a stream template in the layout", "layout note {\n  stream {\n    note { text }\n  }\n}", true],
  ["an element nested inside a stream template", "layout note {\n  stream {\n    memo {\n      note { text }\n    }\n  }\n}", true],
  ["a stream template in the layout's screen body", "screen paper {\n  stream {\n    note { text }\n  }\n  slot\n}\n\nlayout note in paper {\n  margin\n}", false],
  ["a cast template in the layout", "layout note {\n  cast {\n    actor {\n      note { text }\n    }\n  }\n}", true],
  ["an element matched by its class, not its tag", "layout note {\n  memo.note { text }\n}", true],
];

describe("the hover for a layout named after a kind holds what the engine holds (I-2744)", { timeout: 60000 }, () => {
  it.each(NOTE_CASES)("%s", async (_, layouts, holds) => {
    const text = `${layouts}\n\nscene start\n  A bell rings.\nend\n`;
    const program = compileProject(text);
    const documents = new SparkdownDocumentRegistry(["references"]);
    documents.set({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
    const document = documents.get(URI)!;
    const hover = await getHover(
      document,
      documents.tree(URI),
      documents.annotations(URI),
      program,
      undefined,
      document.positionAt(text.indexOf("layout note") + "layout n".length),
    );
    const value = (hover?.contents as { value: string } | undefined)?.value ?? "";
    expect(value.includes("is named after a kind of text")).toBe(holds);
  });
});

import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getHover } from "../../src/utils/providers/getHover";
import { LAYOUT_CONTROL_DESCRIPTIONS } from "../../src/utils/providers/layoutControlDescriptions";
import { STREAM_ELEMENT_DESCRIPTION } from "../../src/utils/providers/streamElementHelp";
import { compileProject, complete } from "./completionHarness";

const URI = "file:///proj/main.sd";

const LAYOUTS = `layout phone {
  thread {
    stream {
      dialogue.bubble { text }
    }
  }
}

layout card {
  dialogue { text }
}
`;

const program = compileProject(`${LAYOUTS}
scene start
  [[clear card]]
  [[clear phone]]
end
`);

const messages = (program.diagnostics?.[URI] ?? []).map((d) =>
  typeof d.message === "string" ? d.message : d.message.value,
);

const hoverAt = async (text: string, needle: string) => {
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  const document = documents.get(URI)!;
  const hover = await getHover(
    document,
    documents.tree(URI),
    documents.annotations(URI),
    undefined,
    undefined,
    document.positionAt(text.indexOf(needle) + 1),
  );
  return hover
    ? {
        value: (hover.contents as { value: string }).value,
        marked: document.getText(hover.range),
      }
    : null;
};

describe("editor help for the stream element (#2738)", () => {
  it("offers stream as an element in a layout body and in an element's body", () => {
    for (const source of [
      "layout log {\n  str@0\n}\n",
      "layout log {\n  frame {\n    str@0\n  }\n}\n",
    ]) {
      const item = complete(source, { program }).items.find((i) => i.label === "stream");
      expect(item, source).toBeDefined();
      expect((item!.documentation as { value: string }).value).toBe(STREAM_ELEMENT_DESCRIPTION);
    }
  });

  it("describes stream on hover inside a layout", async () => {
    const hover = await hoverAt(LAYOUTS, "stream {");
    expect(hover).toEqual({ value: STREAM_ELEMENT_DESCRIPTION, marked: "stream" });
  });

  it("does not describe a word stream outside a layout body", async () => {
    expect(await hoverAt("scene start\n  The stream runs.\nend\n", "stream")).toBeNull();
  });

  it("says that clear works on a layout's stream", () => {
    expect(LAYOUT_CONTROL_DESCRIPTIONS.clear).toContain("every entry from the layout's streams");
  });

  it("warns when clear names a layout with no stream, and is quiet for one with a stream", () => {
    expect(messages.filter((m) => m.includes("clear"))).toEqual([
      "`card` has no stream to clear.",
    ]);
  });
});

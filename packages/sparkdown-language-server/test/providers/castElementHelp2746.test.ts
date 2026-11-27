import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getHover } from "../../src/utils/providers/getHover";
import { CAST_ELEMENT_DESCRIPTION } from "../../src/utils/providers/streamElementHelp";
import { compileProject, complete } from "./completionHarness";

const URI = "file:///proj/main.sd";

const LAYOUTS = `layout main {
  stage {
    cast {
      actor {
        portrait #clear { image }
      }
    }
  }
}
`;

const program = compileProject(`${LAYOUTS}
scene start
  Hello.
end
`);

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

describe("editor help for the cast element (#2746)", () => {
  it("offers cast as an element in a layout body and in an element's body", () => {
    for (const source of [
      "layout main {\n  ca@0\n}\n",
      "layout main {\n  stage {\n    ca@0\n  }\n}\n",
    ]) {
      const item = complete(source, { program }).items.find((i) => i.label === "cast");
      expect(item, source).toBeDefined();
      expect((item!.documentation as { value: string }).value).toBe(CAST_ELEMENT_DESCRIPTION);
    }
  });

  it("describes cast on hover inside a layout", async () => {
    const hover = await hoverAt(LAYOUTS, "cast {");
    expect(hover).toEqual({ value: CAST_ELEMENT_DESCRIPTION, marked: "cast" });
  });

  it("does not describe a word cast outside a layout body", async () => {
    expect(await hoverAt("scene start\n  The cast bows.\nend\n", "cast")).toBeNull();
  });

  it("compiles a layout with a cast without diagnostics", () => {
    expect(program.diagnostics?.[URI] ?? []).toEqual([]);
  });
});

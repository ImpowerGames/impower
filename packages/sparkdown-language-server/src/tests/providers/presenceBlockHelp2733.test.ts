import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getHover } from "../../utils/providers/getHover";
import { accept, completeAt } from "./braceCompletionHarness";

const program = {
  context: {
    style: { base: { $type: "style", $name: "base" } },
  },
} as any;

let version = 0;

const hoverOn = async (text: string, word: string) => {
  const uri = `file:///presence${++version}.sd`;
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri, text, version, languageId: "sparkdown" } });
  const document = documents.get(uri)!;
  const hover = await getHover(
    document,
    documents.tree(uri),
    documents.annotations(uri),
    undefined,
    undefined,
    document.positionAt(text.indexOf(word) + 1),
  );
  return hover
    ? {
        value: (hover.contents as { value: string }).value,
        marked: document.getText(hover.range),
      }
    : null;
};

const FRAME = `style frame {
  opacity = 1
  @initial { opacity = 0 }
  @show { transition-duration = 280ms }
  @hide { opacity = 0 }
  @hovered { opacity = 0.5 }
}
`;

describe("editor help for @initial, @show and @hide (#2733)", () => {
  test("typing @ in a style offers the three blocks", () => {
    for (const source of ["style frame {\n  @|\n}\n", "style frame {\n  @in|\n}\n"]) {
      const labels = completeAt(source, program, "@").map((item) => String(item.label));
      expect(labels).toEqual(expect.arrayContaining(["@initial", "@show", "@hide"]));
    }
  });

  test("accepting a block writes it with its braces at the @", () => {
    const source = "style frame {\n  @sh|\n}\n";
    const item = completeAt(source, program, "@").find((i) => i.label === "@show")!;
    expect(item.documentation).toMatchObject({
      value: expect.stringContaining("applies only while an element is arriving"),
    });
    expect(accept(source, item).text).toBe("style frame {\n  @show {  }\n}\n");
  });

  test("the blocks are offered inside a nested selector block", () => {
    const labels = completeAt("style line {\n  @hovered {\n    @|\n  }\n}\n", program, "@").map(
      (item) => String(item.label),
    );
    expect(labels).toEqual(expect.arrayContaining(["@initial", "@show", "@hide"]));
  });

  test("hovering each block explains it and links the guide", async () => {
    const initial = await hoverOn(FRAME, "@initial");
    expect(initial?.marked).toBe("@initial");
    expect(initial?.value).toContain("the instant it appears");
    expect(initial?.value).toContain("StyleProps.md#appearing-and-leaving");
    expect((await hoverOn(FRAME, "@show"))?.value).toContain("only while an element is arriving");
    expect((await hoverOn(FRAME, "@hide"))?.value).toContain("stays in place until that motion ends");
  });

  test("another state has no presence hover", async () => {
    expect(await hoverOn(FRAME, "@hovered")).toBeNull();
  });
});

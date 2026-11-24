import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getHover } from "../../utils/providers/getHover";
import { complete } from "./completionHarness";

const TRANSITION_PROPERTY_NAMES = ["opacity", "translate", "layout"];

const program = {
  context: {
    style: {
      $schema: {
        $type: "style",
        $name: "$schema",
        transition_property: TRANSITION_PROPERTY_NAMES,
        "transition-property": TRANSITION_PROPERTY_NAMES,
      },
    },
  },
} as any;

const valuesAt = (source: string) =>
  complete(source, { program }).items.map((item) => ({
    ...item,
    label: String(item.label).replace(/^"|"$/g, ""),
  }));

let version = 0;

const hoverAt = async (text: string, needle: string, n = 0) => {
  const uri = `file:///layout${++version}.sd`;
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri, text, version, languageId: "sparkdown" } });
  const document = documents.get(uri)!;
  let index = -1;
  for (let i = 0; i <= n; i++) index = text.indexOf(needle, index + 1);
  expect(index, `${needle} #${n}`).toBeGreaterThanOrEqual(0);
  const hover = await getHover(
    document,
    documents.tree(uri),
    documents.annotations(uri),
    undefined,
    undefined,
    document.positionAt(index + 2),
  );
  if (!hover) {
    return null;
  }
  return { value: (hover.contents as { value: string }).value, marked: document.getText(hover.range) };
};

const STYLES = `style frame {
  transition = layout 0.2s cubic-bezier(0.3, 1.6, 0.55, 1)
}

style line {
  transition-property = opacity, layout
  transition-duration = 0.4s
  opacity = layout
}
`;

describe("editor help for layout in a transition (I-2735)", () => {
  test("transition-property offers layout with its description, beside the other property names", () => {
    for (const property of ["transition-property", "transition_property"]) {
      const items = valuesAt(`style frame {
  ${property} = @1
}
`);
      expect(items.map((item) => item.label)).toEqual(expect.arrayContaining(["layout", "opacity", "translate"]));
      const layout = items.find((item) => item.label === "layout")!;
      expect((layout.documentation as { value: string }).value).toContain("place or size");
      const opacity = items.find((item) => item.label === "opacity")!;
      expect(opacity.documentation).toBeUndefined();
    }
  });

  test("hovering layout in transition or transition-property describes it", async () => {
    for (const n of [0, 1]) {
      const hover = await hoverAt(STYLES, "layout", n);
      expect(hover?.marked).toBe("layout");
      expect(hover?.value).toContain("place or size");
    }
  });

  test("layout as the value of another property has no hover", async () => {
    expect(await hoverAt(STYLES, "layout", 2)).toBeNull();
    expect(await hoverAt(STYLES, "opacity, layout")).toBeNull();
  });
});

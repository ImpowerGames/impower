import { buildSVGAttributeVocabulary } from "@impower/sparkdown/src/attributes";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getHover } from "../../utils/providers/getHover";
import { completeAt, insertedText } from "./braceCompletionHarness";

const FACE = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids:eyes.open:default" id="open"/>
<g data-name="lids:eyes.closed" id="closed"/>
<g data-name="lips:mouth.open:default" id="m-open"/>
<g data-name="lips:mouth.closed" id="m-closed"/>
<g data-name="lips:mouth.teeth" id="m-teeth"/>
</svg>`;

const program = {
  context: {
    morph: { $default: {} },
    image: {
      bunny: { $type: "image", $name: "bunny", uri: "file:///bunny.svg", attribute_vocabulary: buildSVGAttributeVocabulary(FACE) },
    },
  },
} as any;

const labels = (source: string) => completeAt(source, program).map((item) => String(item.label));

const TALK = (field: string) => `morph talk {
  blend = cut
${field}
  keyframes {
    from { mouth { state = closed } }
    50% { mouth { state = open } }
    to { mouth { state = closed } }
  }
}
`;

describe("completion for `when`, `unless` and `rest`", () => {
  test("the root offers the three fields; `rest` inserts a block and the conditions a value", () => {
    const root = labels(TALK("  |"));
    expect(root).toEqual(expect.arrayContaining(["when", "unless", "rest"]));
    const items = completeAt(TALK("  |"), program);
    expect(insertedText(items.find((item) => item.label === "rest")!)).toBe("rest {  }");
    expect(insertedText(items.find((item) => item.label === "unless")!)).toBe("unless = ");
  });

  test("a condition's value offers every group's states with the group, and after a dot that group's states", () => {
    expect(labels(TALK("  unless = |"))).toEqual(expect.arrayContaining(["eyes.open", "eyes.closed", "mouth.teeth"]));
    expect(labels(TALK("  when = mouth.|")).sort()).toEqual(["closed", "open", "teeth"]);
    expect(labels(TALK("  when {\n    |\n  }"))).toEqual(expect.arrayContaining(["eyes.closed", "mouth.teeth"]));
  });

  test("`rest` offers the groups the keyframes drive, a group's `state`, and the states its portraits draw", () => {
    expect(labels(TALK("  rest {\n    |\n  }"))).toEqual(["mouth"]);
    expect(labels(TALK("  rest {\n    mouth { | }\n  }"))).toEqual(["state"]);
    expect(labels(TALK("  rest {\n    mouth { state = | }\n  }")).sort()).toEqual(["closed", "open", "teeth"]);
  });

  test("each field's documentation comes with it", () => {
    const items = completeAt(TALK("  |"), program);
    const doc = (label: string) => (items.find((item) => item.label === label)?.documentation as any)?.value as string;
    expect(doc("when")).toContain("Plays the morph only on a look where every listed state is active");
    expect(doc("unless")).toContain("Keeps the morph off a look where any listed state is active");
    expect(doc("rest")).toContain("The pose the morph holds its groups in");
  });
});

let version = 0;
const hoverAt = async (text: string, needle: string) => {
  const uri = `file:///talk${++version}.sd`;
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri, text, version, languageId: "sparkdown" } });
  const document = documents.get(uri)!;
  const hover = await getHover(document, documents.tree(uri), documents.annotations(uri), undefined, undefined, document.positionAt(text.indexOf(needle) + 1));
  return (hover?.contents as { value: string } | undefined)?.value;
};

describe("hover for `when`, `unless` and `rest`", () => {
  test("each field says what it does, and a paint entry's `when` keeps its own text", async () => {
    const text = `morph talk {
  blend = cut
  when = mouth.teeth
  unless = eyes.closed
  rest {
    mouth { state = teeth }
  }
  keyframes {
    from { mouth { state = closed } }
    to { mouth { state = open } }
  }
  paints {
    { targets { lip }; state = mouth.open; when = eyes.open; fill = red }
  }
}
`;
    expect(await hoverAt(text, "when = mouth")).toContain("Plays the morph only on a look where every listed state is active");
    expect(await hoverAt(text, "unless")).toContain("Keeps the morph off a look");
    expect(await hoverAt(text, "rest {")).toContain("The pose the morph holds its groups in");
    expect(await hoverAt(text, "when = eyes")).toContain("Applies the entry only in variants");
  });
});

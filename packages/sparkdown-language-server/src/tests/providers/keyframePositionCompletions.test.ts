import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getCompletions } from "../../utils/providers/getCompletions";

const URI = "file:///complete.sd";

function setup(source: string) {
  const documents = new SparkdownDocumentRegistry([
    "characters",
    "declarations",
    "references",
  ]);
  documents.set({
    textDocument: {
      uri: URI,
      text: source,
      version: 1,
      languageId: "sparkdown",
    },
  });
  const scriptAnnotations = new Map([[URI, documents.annotations(URI)]]);
  return { documents, scriptAnnotations };
}

function positionAt(source: string, marker = "|") {
  const idx = source.indexOf(marker);
  const text = source.replace(marker, "");
  const before = source.slice(0, idx);
  const line = before.split("\n").length - 1;
  const character = idx - (before.lastIndexOf("\n") + 1);
  return { text, position: { line, character } };
}

const program = {
  context: {
    animation: { $default: {} },
  },
} as any;

function labelsAt(source: string): string[] {
  const { text, position } = positionAt(source);
  const { documents, scriptAnnotations } = setup(text);
  const items = getCompletions(
    documents.get(URI),
    documents.tree(URI),
    scriptAnnotations,
    program,
    undefined,
    position,
    undefined,
  );
  return (items ?? []).map((i) => String(i.label));
}

describe("provider · keyframe position completions", () => {
  test("offers `from` and `to` on a line inside a `keyframes:` block", () => {
    const labels = labelsAt(`animation fade with
  keyframes:
    |
end
`);
    expect(labels).toContain("from");
    expect(labels).toContain("to");
  });

  test("offers them after a partly typed position", () => {
    const labels = labelsAt(`animation fade with
  keyframes:
    fr|
end
`);
    expect(labels).toContain("from");
  });

  test("inserts the position with its trailing colon", () => {
    const { text, position } = positionAt(`animation fade with
  keyframes:
    |
end
`);
    const { documents, scriptAnnotations } = setup(text);
    const items =
      getCompletions(
        documents.get(URI),
        documents.tree(URI),
        scriptAnnotations,
        program,
        undefined,
        position,
        undefined,
      ) ?? [];
    expect(items.find((i) => i.label === "from")?.insertText).toBe("from:");
  });

  test("does not offer them inside a sibling container", () => {
    const labels = labelsAt(`animation fade with
  timing:
    |
end
`);
    expect(labels).not.toContain("from");
    expect(labels).not.toContain("to");
  });

  test("does not offer them one level deeper, among a keyframe's properties", () => {
    const labels = labelsAt(`animation fade with
  keyframes:
    from:
      |
end
`);
    expect(labels).not.toContain("from");
  });
});

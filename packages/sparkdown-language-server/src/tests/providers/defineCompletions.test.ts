import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getCompletions } from "../../utils/providers/getCompletions";

// Smoke + behavior coverage for the de-staled define/struct completion paths.
// getCompletions has no live-editor harness, so these lock the verifiable
// pieces: it must not throw on representative define/struct/access sources, and
// it must offer engine type names after `as` (the inverted-model type slot).

const URI = "file:///complete.sd";

function setup(source: string) {
  const documents = new SparkdownDocumentRegistry([
    "characters",
    "declarations",
    "references",
  ]);
  documents.set({
    textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" },
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
    character: { $default: {} },
    animation: { $default: {} },
    image: { hero: { $type: "image", $name: "hero" } },
  },
} as any;

describe("provider · define completions (D2)", () => {
  test("offers engine type names after `as`", () => {
    const { text, position } = positionAt(`define foo as |\n`);
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
    const labels = (items ?? []).map((i) => i.label);
    expect(labels).toContain("character");
    expect(labels).toContain("animation");
  });

  test("does not throw inside a structural struct body", () => {
    const { text, position } = positionAt(`screen s with
  stage:
    backdrop:
      |
end
`);
    const { documents, scriptAnnotations } = setup(text);
    expect(() =>
      getCompletions(
        documents.get(URI),
        documents.tree(URI),
        scriptAnnotations,
        program,
        undefined,
        position,
        undefined,
      ),
    ).not.toThrow();
  });

  test("does not throw on a struct scalar value", () => {
    const { text, position } = positionAt(`style b with
  background-color = |
end
`);
    const { documents, scriptAnnotations } = setup(text);
    expect(() =>
      getCompletions(
        documents.get(URI),
        documents.tree(URI),
        scriptAnnotations,
        program,
        undefined,
        position,
        undefined,
      ),
    ).not.toThrow();
  });
});

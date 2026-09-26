import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getCompletions } from "../../utils/providers/getCompletions";

// Completion in one script offers the names another script in the program
// declares. Each script's declaration ranges are offsets into that script's
// own text, so they are read through that script's document.

const MAIN = "file:///main.sd";
const CHAPTER = "file:///chapter.sd";

const CHAPTER_TEXT = "store gold = 5\n\nscene chapter_scene\n  Hi.\nend\n";

function labelsAt(mainSource: string, order: "chapter-first" | "main-first") {
  const cursor = mainSource.indexOf("|");
  const mainText = mainSource.replace("|", "");
  const documents = new SparkdownDocumentRegistry([
    "characters",
    "declarations",
    "references",
  ]);
  documents.set({
    textDocument: { uri: MAIN, text: mainText, version: 1, languageId: "sparkdown" },
  });
  documents.set({
    textDocument: { uri: CHAPTER, text: CHAPTER_TEXT, version: 1, languageId: "sparkdown" },
  });
  const uris = order === "chapter-first" ? [CHAPTER, MAIN] : [MAIN, CHAPTER];
  const scripts = new Map(
    uris.map(
      (uri) =>
        [
          uri,
          {
            annotations: documents.annotations(uri),
            read: (from: number, to: number) => documents.get(uri)!.read(from, to),
          },
        ] as const,
    ),
  );
  const main = documents.get(MAIN)!;
  const items = getCompletions(
    main,
    documents.tree(MAIN),
    scripts,
    undefined,
    undefined,
    main.positionAt(cursor),
    undefined,
  );
  return (items ?? []).map((i) => String(i.label));
}

describe("completion across scripts (#891)", () => {
  for (const order of ["chapter-first", "main-first"] as const) {
    test(`offers another script's var and scene, not fragments (${order})`, () => {
      const labels = labelsAt("function main()\n  return g|\nend\n", order);
      expect(labels).toContain("gold");
      expect(labels).toContain("chapter_scene");
      expect(labels).not.toContain("on m");
    });
  }

  test("a longer open script keeps its own names and gains the other script's", () => {
    const labels = labelsAt(
      "store alpha = 1\nstore beta = 2\nfunction main()\n  return g|\nend\n",
      "chapter-first",
    );
    expect(labels).toEqual(
      expect.arrayContaining(["alpha", "beta", "gold", "chapter_scene"]),
    );
    expect(labels).not.toContain("alph");
  });

  test("a divert in a short script offers the other script's scene", () => {
    const labels = labelsAt("-> |\n", "chapter-first");
    expect(labels).toContain("chapter_scene");
  });
});

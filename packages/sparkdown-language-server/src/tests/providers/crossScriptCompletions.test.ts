import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getAnnotatedScripts } from "../../utils/annotations/getAnnotatedScripts";
import { getCompletions } from "../../utils/providers/getCompletions";

// Completion in one script offers the names another script in the program
// declares. Each script's declaration and character ranges are offsets into
// that script's own text, so they are read through that script's document.

const MAIN = "file:///main.sd";
const CHAPTER = "file:///chapter.sd";

const CHAPTER_TEXT =
  "store gold = 5\n\nscene chapter_scene\n  BARTHOLOMEW: Hi.\nend\n\nfunction helper(gift)\n  local gem = 1\n  store gains = 2\nend\n";

function setup(mainText: string) {
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
  const workspace = {
    document: (uri: string) => documents.get(uri),
    annotations: (uri: string) => documents.annotations(uri),
    tree: (uri: string) => documents.tree(uri),
  };
  return { documents, workspace };
}

function labelsAt(
  mainSource: string,
  programScripts: Record<string, number> | undefined,
) {
  const cursor = mainSource.indexOf("|");
  const { documents, workspace } = setup(mainSource.replace("|", ""));
  const main = documents.get(MAIN)!;
  const items = getCompletions(
    main,
    documents.tree(MAIN),
    getAnnotatedScripts(MAIN, programScripts, workspace),
    undefined,
    undefined,
    main.positionAt(cursor),
    undefined,
  );
  return (items ?? []).map((i) => String(i.label));
}

const CHAPTER_FIRST = { [CHAPTER]: 1, [MAIN]: 1 };
const MAIN_FIRST = { [MAIN]: 1, [CHAPTER]: 1 };

describe("completion across scripts (#891)", () => {
  for (const [name, order] of [
    ["chapter-first", CHAPTER_FIRST],
    ["main-first", MAIN_FIRST],
  ] as const) {
    test(`offers another script's var and scene, not fragments (${name})`, () => {
      const labels = labelsAt("function main()\n  return g|\nend\n", order);
      expect(labels).toContain("gold");
      expect(labels).toContain("chapter_scene");
      expect(labels).not.toContain("on m");
    });
  }

  test("a longer open script keeps its own names and gains the other script's", () => {
    const labels = labelsAt(
      "store alpha = 1\nstore beta = 2\nfunction main()\n  return g|\nend\n",
      CHAPTER_FIRST,
    );
    expect(labels).toEqual(
      expect.arrayContaining(["alpha", "beta", "gold", "chapter_scene"]),
    );
    expect(labels).not.toContain("alph");
  });

  test("another script's function locals and parameters are not offered, and its stored variables are", () => {
    const labels = labelsAt("function main()\n  return g|\nend\n", CHAPTER_FIRST);
    expect(labels).toContain("gains");
    expect(labels).not.toContain("gem");
    expect(labels).not.toContain("gift");
  });

  test("a local at the top of the open script is offered after another script's scene", () => {
    const labels = labelsAt("local topLevel = 1\n{t|}\n", CHAPTER_FIRST);
    expect(labels).toContain("topLevel");
  });

  test("a divert in a short script offers the other script's scene", () => {
    const labels = labelsAt("-> |\n", CHAPTER_FIRST);
    expect(labels).toContain("chapter_scene");
  });

  test("a character another script introduces is offered by name", () => {
    const labels = labelsAt("scene opening\n  B|\nend\n", CHAPTER_FIRST);
    expect(labels).toContain("BARTHOLOMEW");
  });
});

describe("the scripts a completion request sees (#891)", () => {
  test("before the first compile, the open document is keyed by its own URI", () => {
    const { workspace } = setup("store alpha = 1\n");
    const scripts = getAnnotatedScripts(MAIN, undefined, workspace);
    expect([...scripts.keys()]).toEqual([MAIN]);
    expect(labelsAt("store alpha = 1\nfunction main()\n  return a|\nend\n", undefined)).toContain(
      "alpha",
    );
  });

  test("a program script with no open document is left out", () => {
    const { workspace } = setup("");
    const scripts = getAnnotatedScripts(
      MAIN,
      { [MAIN]: 1, "file:///closed.sd": 1, [CHAPTER]: 1 },
      workspace,
    );
    expect([...scripts.keys()]).toEqual([MAIN, CHAPTER]);
  });
});

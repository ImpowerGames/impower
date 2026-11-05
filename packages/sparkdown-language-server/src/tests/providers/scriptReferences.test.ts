import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getScriptReferences } from "../../utils/providers/getScriptReferences";

const MAIN = "file:///p/main.sd";
const CHAPTER = "file:///p/Scripts/chapter.sd";
const CAST = "file:///p/Scripts/cast.sd";
const HELPERS = "file:///p/Scripts/helpers.sd";
const LOOSE = "file:///p/Scripts/loose.sd";

const SOURCES: Record<string, string> = {
  [MAIN]: "scene start\n  -> chapter_scene\nend\n",
  [CHAPTER]:
    "scene chapter_scene\n  raffles: Hello.\n  & helper()\n  -> .part\n  branch part\n    Hi.\n  end\nend\n",
  [CAST]: 'define raffles as character with\n  name = "RAFFLES"\nend\n',
  [HELPERS]: "function helper()\n  return 1\nend\n",
  [LOOSE]: "scene loose_scene\n  Nobody comes here.\nend\n",
};

function workspaceOf(sources: Record<string, string>) {
  const documents = new SparkdownDocumentRegistry([
    "characters",
    "declarations",
    "references",
  ]);
  for (const [uri, text] of Object.entries(sources)) {
    documents.set({
      textDocument: { uri, text, version: 1, languageId: "sparkdown" },
    });
  }
  return {
    document: (uri: string) => documents.get(uri),
    annotations: (uri: string) => documents.annotations(uri),
    uris: () => documents.keys(),
    compilerConfig: undefined,
  } as Parameters<typeof getScriptReferences>[0];
}

const referencedBy = (sources: Record<string, string>, uri: string) =>
  new Set(
    getScriptReferences(workspaceOf(sources), undefined)
      .filter((r) => r.to === uri)
      .map((r) => r.from),
  ).size;

describe("provider · script references (#1009)", () => {
  test("a divert into another script's scene is a divert reference to that script", () => {
    const references = getScriptReferences(workspaceOf(SOURCES), undefined);
    expect(references).toContainEqual({ from: MAIN, to: CHAPTER, divert: true });
  });

  test("using a define or calling a function another script declares references that script", () => {
    const references = getScriptReferences(workspaceOf(SOURCES), undefined);
    expect(references).toContainEqual({ from: CHAPTER, to: CAST, divert: false });
    expect(references).toContainEqual({ from: CHAPTER, to: HELPERS, divert: false });
  });

  test("a script's references to its own scenes and branches are not counted", () => {
    const references = getScriptReferences(workspaceOf(SOURCES), undefined);
    expect(references.filter((r) => r.from === r.to)).toEqual([]);
    expect(references.filter((r) => r.to === LOOSE)).toEqual([]);
  });

  test("adding a divert to a script's scene in another script raises its count by one", () => {
    expect(referencedBy(SOURCES, CHAPTER)).toBe(1);
    const more = {
      ...SOURCES,
      [LOOSE]: "scene loose_scene\n  -> chapter_scene.part\nend\n",
    };
    expect(referencedBy(more, CHAPTER)).toBe(2);
  });

  test("using a define in an expression, by name or through a property, references the script that defines it", () => {
    const SETTINGS = "file:///p/Scripts/settings.sd";
    const sources = {
      [MAIN]: "scene start\n  {settings.score}\nend\n",
      [SETTINGS]: "define settings with\n  score = 1\nend\n",
      [CAST]: 'define raffles as character with\n  name = "RAFFLES"\nend\n',
      [CHAPTER]: "scene chapter_scene\n  {character.raffles.name}\nend\n",
    };
    const references = getScriptReferences(workspaceOf(sources), undefined);
    expect(references).toContainEqual({ from: MAIN, to: SETTINGS, divert: false });
    expect(references).toContainEqual({ from: CHAPTER, to: CAST, divert: false });
  });

  test("a define's type is not something the defining script declares", () => {
    const sources = {
      [CAST]: 'define raffles as character with\n  name = "RAFFLES"\nend\n',
      [CHAPTER]: "scene chapter_scene\n  {character.someone_else.name}\nend\n",
    };
    expect(referencedBy(sources, CAST)).toBe(0);
  });

  test("a scene two scripts declare, as after Duplicate, counts a reference for each of them", () => {
    const COPY = "file:///p/Scripts/epilogue copy.sd";
    const EPILOGUE = "file:///p/Scripts/epilogue.sd";
    const sources = {
      [MAIN]: "scene start\n  -> epilogue\nend\n",
      [COPY]: "scene epilogue\n  The end.\nend\n",
      [EPILOGUE]: "scene epilogue\n  The end.\nend\n",
    };
    expect(referencedBy(sources, EPILOGUE)).toBe(1);
    expect(referencedBy(sources, COPY)).toBe(1);
  });

  test("diverts are listed in the order each script reaches them", () => {
    const sources = {
      [MAIN]: "scene start\n  -> loose_scene\n  -> chapter_scene\nend\n",
      [CHAPTER]: "scene chapter_scene\n  Hi.\nend\n",
      [LOOSE]: "scene loose_scene\n  Hi.\nend\n",
    };
    const diverts = getScriptReferences(workspaceOf(sources), undefined)
      .filter((r) => r.from === MAIN && r.divert)
      .map((r) => r.to);
    expect(diverts).toEqual([LOOSE, CHAPTER]);
  });
});

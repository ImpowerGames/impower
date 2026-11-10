import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getScriptReferences } from "../../utils/providers/getScriptReferences";

const MAIN = "file:///p/main.sd";
const CHAPTER = "file:///p/Scripts/chapter.sd";
const CAST = "file:///p/Scripts/cast.sd";
const HELPERS = "file:///p/Scripts/helpers.sd";
const LOOSE = "file:///p/Scripts/loose.sd";
const SETTINGS = "file:///p/Scripts/settings.sd";

const CAST_SOURCE = 'define raffles as character with\n  name = "RAFFLES"\nend\n';
const SETTINGS_SOURCE = "define settings with\n  score = 1\nend\n";

const SOURCES: Record<string, string> = {
  [MAIN]: "scene start\n  -> chapter_scene\nend\n",
  [CHAPTER]:
    "scene chapter_scene\n  raffles: Hello.\n  & helper()\n  -> .part\n  branch part\n    Hi.\n  end\nend\n",
  [CAST]: CAST_SOURCE,
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

const referencesOf = (sources: Record<string, string>) =>
  getScriptReferences(workspaceOf(sources), undefined);

const referencedBy = (sources: Record<string, string>, uri: string) =>
  new Set(referencesOf(sources).filter((r) => r.to === uri).map((r) => r.from)).size;

describe("provider · script references counted from whole references (#1009)", () => {
  test("a divert into another script's scene or branch references that script", () => {
    const references = referencesOf({
      ...SOURCES,
      [LOOSE]: "scene loose_scene\n  -> chapter_scene.part\nend\n",
    });
    expect(references).toContainEqual({ from: MAIN, to: CHAPTER, divert: true });
    expect(references).toContainEqual({ from: LOOSE, to: CHAPTER, divert: true });
  });

  test("calling a function and cueing a character another script declares references that script", () => {
    const references = referencesOf(SOURCES);
    expect(references).toContainEqual({ from: CHAPTER, to: HELPERS, divert: false });
    expect(references).toContainEqual({ from: CHAPTER, to: CAST, divert: false });
  });

  test("using a define by its own name references the script that defines it", () => {
    const references = referencesOf({
      [MAIN]: "scene start\n  {settings.score}\nend\n",
      [SETTINGS]: SETTINGS_SOURCE,
    });
    expect(references).toContainEqual({ from: MAIN, to: SETTINGS, divert: false });
  });

  test("a define of another define's type uses the script that defines that type", () => {
    const ROCK = "file:///p/Scripts/rock.sd";
    const PEBBLE = "file:///p/Scripts/pebble.sd";
    const references = referencesOf({
      [ROCK]: "define rock with\n  hardness = 5\nend\n",
      [PEBBLE]: "define pebble as rock with\n  size = 1\nend\n",
    });
    expect(references).toContainEqual({ from: PEBBLE, to: ROCK, divert: false });
  });

  test("references within the declaring script, and a define's own type, are not counted", () => {
    const references = referencesOf(SOURCES);
    expect(references.filter((r) => r.from === r.to)).toEqual([]);
    expect(references.filter((r) => r.to === LOOSE)).toEqual([]);
    expect(
      referencedBy(
        { [CAST]: CAST_SOURCE, [CHAPTER]: "scene chapter_scene\n  {character.someone_else.name}\nend\n" },
        CAST,
      ),
    ).toBe(0);
  });

  test("a parameter named like a define is the function's own, not a use of the define", () => {
    expect(
      referencedBy(
        {
          [SETTINGS]: SETTINGS_SOURCE,
          [HELPERS]: "function show(settings)\n  return settings.score\nend\n",
        },
        SETTINGS,
      ),
    ).toBe(0);
  });

  test.each([
    ["a local", "function show()\n  local settings = {score = 2}\n  return settings.score\nend\n"],
    ["a local an alias then reads", "function show()\n  local settings = {score = 2}\n  local alias = settings\n  return alias.score\nend\n"],
    [
      "an outer function's local a nested function captures",
      "function outer()\n  local settings = {score = 2}\n  function inner()\n    return settings.score\n  end\n  return inner()\nend\n",
    ],
  ])("%s named like a define is the script's own, not a use of the define", (_, helpers) => {
    expect(referencedBy({ [SETTINGS]: SETTINGS_SOURCE, [HELPERS]: helpers }, SETTINGS)).toBe(0);
  });

  test("adding a divert to a script's scene in another script raises its count by one", () => {
    expect(referencedBy(SOURCES, CHAPTER)).toBe(1);
    expect(
      referencedBy({ ...SOURCES, [LOOSE]: "scene loose_scene\n  -> chapter_scene.part\nend\n" }, CHAPTER),
    ).toBe(2);
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
    const diverts = referencesOf(sources)
      .filter((r) => r.from === MAIN && r.divert)
      .map((r) => r.to);
    expect(diverts).toEqual([LOOSE, CHAPTER]);
  });
});

describe("provider · script references read access paths and bindings from the annotations (I-1969)", () => {
  test.each([
    ["a property access through the define's type", "{character.raffles.name}"],
    ["whitespace around the dots", "{character . raffles . name}"],
    ["a string index", '{character["raffles"].name}'],
    ["a parenthesized root", "{(character).raffles.name}"],
  ])("%s counts as a use of the define's script", (_, expression) => {
    expect(
      referencedBy({ [CAST]: CAST_SOURCE, [CHAPTER]: `scene chapter_scene\n  ${expression}\nend\n` }, CAST),
    ).toBe(1);
  });

  test.each([
    ["a computed index", "{character[who].name}"],
    ["a call argument followed by a property", "{f(raffles).name}"],
  ])("%s does not count as a use of the define's script", (_, expression) => {
    expect(
      referencedBy({ [CAST]: CAST_SOURCE, [CHAPTER]: `scene chapter_scene\n  ${expression}\nend\n` }, CAST),
    ).toBe(0);
  });

  test("a use through a local alias is deliberately not counted as a use of the define's script", () => {
    expect(
      referencedBy(
        {
          [CAST]: CAST_SOURCE,
          [HELPERS]: "function cast_name()\n  local cast = character\n  return cast.raffles.name\nend\n",
        },
        CAST,
      ),
    ).toBe(0);
  });

  test.each([
    ["a parameter in another function", "function show(settings)\n  return settings.score\nend\nfunction other()\n  return settings.score\nend\n"],
    ["a local in another function", "function show()\n  local settings = {score = 2}\n  return settings.score\nend\nfunction other()\n  return settings.score\nend\n"],
    ["an anonymous function's parameter in the same function", "function show()\n  local f = function(settings)\n    return settings.score\n  end\n  return settings.score\nend\n"],
    ["a local declared after the use", "function show()\n  local result = settings.score\n  local settings = {score = 2}\n  return result\nend\n"],
    ["a local whose block has ended", "function show()\n  if true then\n    local settings = {score = 2}\n  end\n  return settings.score\nend\n"],
  ])("a script that also binds the name, as %s, counts its use of the define outside that binding", (_, helpers) => {
    expect(referencedBy({ [SETTINGS]: SETTINGS_SOURCE, [HELPERS]: helpers }, SETTINGS)).toBe(1);
  });

  test.each([
    ["a const in a function", "function show()\n  const settings = {score = 2}\n  return settings.score\nend\n"],
    ["a repeat body's local in its until condition", "function show()\n  repeat\n    local settings = {score = 2}\n  until settings.score > 0\nend\n"],
    ["a local function", "function show()\n  local function settings()\n    return 1\n  end\n  return settings()\nend\n"],
  ])("%s named like a define is the script's own, not a use of the define", (_, helpers) => {
    expect(referencedBy({ [SETTINGS]: SETTINGS_SOURCE, [HELPERS]: helpers }, SETTINGS)).toBe(0);
  });

  test("another script that binds no local or parameter of that name still counts its use", () => {
    expect(
      referencedBy(
        {
          [SETTINGS]: SETTINGS_SOURCE,
          [HELPERS]: "function show()\n  local settings = {score = 2}\n  return settings.score\nend\n",
          [LOOSE]: "function other()\n  return settings.score\nend\n",
        },
        SETTINGS,
      ),
    ).toBe(1);
  });
});

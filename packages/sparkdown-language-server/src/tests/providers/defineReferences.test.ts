import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getReferences } from "../../utils/providers/getReferences";
import { getRenameEdits } from "../../utils/providers/getRenameEdits";

const URI = "file:///provider.sd";

function makeWorkspace(source: string) {
  const documents = new SparkdownDocumentRegistry([
    "characters",
    "declarations",
    "references",
  ]);
  documents.set({
    textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" },
  });
  const workspace = {
    annotations: (uri: string) => documents.annotations(uri),
    document: (uri: string) => documents.get(uri),
    tree: (uri: string) => documents.tree(uri),
    uris: () => [...documents.keys()],
    compilerConfig: undefined,
    findFiles: () => [],
  } as any;
  return { documents, workspace };
}

function posAt(source: string, needle: string, occurrence = 1) {
  let idx = -1;
  for (let i = 0; i < occurrence; i++) {
    idx = source.indexOf(needle, idx + 1);
  }
  const offset = idx + 1;
  const before = source.slice(0, offset);
  const line = before.split("\n").length - 1;
  const character = offset - (before.lastIndexOf("\n") + 1);
  return { line, character };
}

describe("provider · define references (D2)", () => {
  const source = `define raffles as character with
  name = "RAFFLES"
end
raffles: Hello.
`;

  test("find-references on a define name includes the dialogue cue", () => {
    const { documents, workspace } = makeWorkspace(source);
    const { references } = getReferences(
      documents.get(URI),
      documents.tree(URI),
      undefined,
      workspace,
      posAt(source, "raffles", 1),
      {
        searchOtherFiles: false,
        includeDeclaration: true,
        includeInterdependent: false,
        includeLinks: false,
      },
    );
    expect(references && references.length).toBeGreaterThanOrEqual(2);
    const lines = references!.map((r) => r.range.start.line).sort();
    expect(lines).toContain(0);
    expect(lines).toContain(3);
  });

  test("rename on a define name rewrites the define and the cue", () => {
    const { documents, workspace } = makeWorkspace(source);
    const edits = getRenameEdits(
      undefined,
      documents.get(URI),
      documents.tree(URI),
      undefined,
      workspace,
      "ravi",
      posAt(source, "raffles", 1),
    );
    const fileEdits = edits?.changes?.[URI] ?? [];
    expect(fileEdits.length).toBeGreaterThanOrEqual(2);
    for (const e of fileEdits) {
      expect(e.newText).toBe("ravi");
    }
  });
});

describe("provider · references through access paths and bindings (I-1969)", () => {
  const CAST = "file:///cast.sd";
  const CHAPTER = "file:///chapter.sd";
  const HELPERS = "file:///helpers.sd";
  const sources: Record<string, string> = {
    [CAST]: 'define raffles as character with\n  name = "RAFFLES"\nend\ndefine settings with\n  score = 1\nend\n',
    [CHAPTER]: 'scene chapter\n  {character.raffles.name}\n  {character["raffles"].name}\n  {settings.score}\n  {((character).raffles).name}\nend\n',
    [HELPERS]: "function show(settings)\n  return settings.score\nend\nfunction total()\n  local settings = 2\n  return settings\nend\nfunction other()\n  local settings = 3\n  return settings\nend\nfunction count()\n  local function settings(n)\n    return settings(n - 1)\n  end\n  return settings(2)\nend\nscene local_scene\n  local settings = 4\n  {settings}\nend\n",
  };

  function workspaceOf() {
    const documents = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
    for (const [uri, text] of Object.entries(sources)) {
      documents.set({ textDocument: { uri, text, version: 1, languageId: "sparkdown" } });
    }
    const workspace = {
      annotations: (uri: string) => documents.annotations(uri),
      document: (uri: string) => documents.get(uri),
      tree: (uri: string) => documents.tree(uri),
      uris: () => [...documents.keys()],
      compilerConfig: undefined,
      findFiles: () => [],
    } as any;
    return { documents, workspace };
  }

  function referencesAt(uri: string, needle: string, occurrence = 1) {
    const { documents, workspace } = workspaceOf();
    const { references } = getReferences(
      documents.get(uri),
      documents.tree(uri),
      undefined,
      workspace,
      posAt(sources[uri]!, needle, occurrence),
      { searchOtherFiles: true, includeDeclaration: true, includeInterdependent: false, includeLinks: false },
    );
    return (references ?? []).map((r) => ({
      uri: r.uri,
      text: documents.get(r.uri)!.getText(r.range),
      line: r.range.start.line,
    }));
  }

  test("find-references on a define finds property-access uses in other scripts", () => {
    const references = referencesAt(CAST, "raffles");
    expect(references).toContainEqual({ uri: CHAPTER, text: "raffles", line: 1 });
    expect(references).toContainEqual({ uri: CHAPTER, text: "raffles", line: 2 });
  });

  test("find-references on a define skips parameters and locals of the same name and their uses", () => {
    const references = referencesAt(CAST, "settings");
    expect(references).toContainEqual({ uri: CHAPTER, text: "settings", line: 3 });
    expect(references.filter((r) => r.uri === HELPERS)).toEqual([]);
  });

  test("find-references on a use bound to a local reaches that local only", () => {
    expect(referencesAt(HELPERS, "settings", 4)).toEqual([
      { uri: HELPERS, text: "settings", line: 4 },
      { uri: HELPERS, text: "settings", line: 5 },
    ]);
  });

  test("find-references on a recursive local function reaches its recursive call and its outside call", () => {
    expect(referencesAt(HELPERS, "settings", 7)).toEqual([
      { uri: HELPERS, text: "settings", line: 12 },
      { uri: HELPERS, text: "settings", line: 13 },
      { uri: HELPERS, text: "settings", line: 15 },
    ]);
  });

  test("find-references on a scene's local reaches its use and not the define", () => {
    expect(referencesAt(HELPERS, "settings", 10)).toEqual([
      { uri: HELPERS, text: "settings", line: 18 },
      { uri: HELPERS, text: "settings", line: 19 },
    ]);
  });

  test("find-references on a parameter reaches its uses and not a local of the same name", () => {
    expect(referencesAt(HELPERS, "settings", 1)).toEqual([
      { uri: HELPERS, text: "settings", line: 0 },
      { uri: HELPERS, text: "settings", line: 1 },
    ]);
  });

  test("find-references on a property finds its path through the define, through parentheses too", () => {
    const references = referencesAt(CAST, "name");
    expect(references).toContainEqual({ uri: CHAPTER, text: "name", line: 1 });
    expect(references).toContainEqual({ uri: CHAPTER, text: "name", line: 4 });
  });
});

describe("provider · screen/style layer interdependency (D2)", () => {
  const source = `layout s {
  backdrop {
    image = "bg"
  }
}
style backdrop {
  background-color = black
}
`;

  test("find-references on a screen layer reaches the same-named style block", () => {
    const { documents, workspace } = makeWorkspace(source);
    const { references } = getReferences(
      documents.get(URI),
      documents.tree(URI),
      undefined,
      workspace,
      posAt(source, "backdrop", 1),
      {
        searchOtherFiles: false,
        includeDeclaration: true,
        includeInterdependent: true,
        includeLinks: false,
      },
    );
    const lines = (references ?? []).map((r) => r.range.start.line);
    expect(lines).toContain(1);
    expect(lines).toContain(5);
  });
});

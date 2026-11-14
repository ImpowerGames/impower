import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { canRename } from "../../utils/providers/canRename";
import { getReferences } from "../../utils/providers/getReferences";
import { getRenameEdits } from "../../utils/providers/getRenameEdits";
import { compileProject, complete } from "./completionHarness";

const URI = "file:///provider.sd";

const DEFS = `define raffles as character with
  name = "RAFFLES"
  aliases = { "???" }
end

define bunny as character with
  name = "BUNNY"
  aliases = { "???" }
end
`;

const SOURCE = `${DEFS}
scene start
  ??? as raffles:
    You don't remember me?
  BUNNY as raffles (O.S.):
    I can do his voice, you know.
end
`;

function workspaceOf(source: string) {
  const documents = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
  documents.set({ textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" } });
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

function positionOf(source: string, needle: string, occurrence: number) {
  let index = -1;
  for (let n = 0; n < occurrence; n += 1) index = source.indexOf(needle, index + 1);
  const offset = index + 1;
  const before = source.slice(0, offset);
  return { line: before.split("\n").length - 1, character: offset - (before.lastIndexOf("\n") + 1) };
}

function renamed(source: string, needle: string, occurrence: number, newName: string) {
  const { documents, workspace } = workspaceOf(source);
  const edits = getRenameEdits(
    undefined,
    documents.get(URI),
    documents.tree(URI),
    undefined,
    workspace,
    newName,
    positionOf(source, needle, occurrence),
  );
  let text = source;
  const document = documents.get(URI)!;
  const changes = [...(edits?.changes?.[URI] ?? [])].sort(
    (a, b) => document.offsetAt(b.range.start) - document.offsetAt(a.range.start),
  );
  for (const change of changes) {
    text =
      text.slice(0, document.offsetAt(change.range.start)) +
      change.newText +
      text.slice(document.offsetAt(change.range.end));
  }
  return text;
}

const characterLabels = (labels: string[]) =>
  labels.filter((label) => ["raffles", "bunny", "RAFFLES", "BUNNY", "???"].includes(label)).sort();

describe("the speaker a cue names with `as` in the editor (#2283)", () => {
  test("completion after `as` on a cue offers the character define names only", () => {
    const program = compileProject(SOURCE);
    const at = complete(SOURCE.replace("  ??? as raffles:\n", "  ??? as @1:\n"), { program });
    expect(characterLabels(at.labels)).toEqual(["bunny", "raffles"]);
    expect(at.detail("raffles")).toBe("character");
  });

  test("completion after `as` on a cue being typed offers the character define names only", () => {
    const program = compileProject(SOURCE);
    const at = complete(SOURCE.replace("  ??? as raffles:\n    You don't remember me?\n", "  ??? as r@1\n"), { program });
    expect(characterLabels(at.labels)).toEqual(["bunny", "raffles"]);
  });

  test("completion after `as` on a cue being typed under a new shown name offers the character define names", () => {
    const program = compileProject(SOURCE);
    const at = complete(SOURCE.replace("  ??? as raffles:\n    You don't remember me?\n", "  MASKED MAN as r@1\n"), { program });
    expect(characterLabels(at.labels)).toEqual(["bunny", "raffles"]);
  });

  test("a line of prose ending in `as` and a word is offered no character define names", () => {
    const program = compileProject(SOURCE);
    const at = complete(SOURCE.replace("  ??? as raffles:\n    You don't remember me?\n", "  He looked as r@1\n"), { program });
    expect(characterLabels(at.labels)).toEqual([]);
  });

  test("go to definition on the word after `as` lands on the character's define", () => {
    const { documents, workspace } = workspaceOf(SOURCE);
    const { references } = getReferences(
      documents.get(URI),
      documents.tree(URI),
      undefined,
      workspace,
      positionOf(SOURCE, "raffles:", 1),
      {
        searchOtherFiles: true,
        includeDeclaration: true,
        excludeUses: true,
        includeInterdependent: false,
        includeLinks: false,
      },
    );
    expect(references).toBeDefined();
    expect(
      (references ?? []).map((r) => ({ text: documents.get(URI)!.getText(r.range), line: r.range.start.line })),
    ).toEqual([{ text: "raffles", line: 0 }]);
  });

  test("renaming the define renames the word after `as`, and leaves the shown names", () => {
    const text = renamed(SOURCE, "raffles", 1, "arthur");
    expect(text).toContain("define arthur as character with");
    expect(text).toContain("  ??? as arthur:\n");
    expect(text).toContain("  BUNNY as arthur (O.S.):\n");
  });

  test("a rename can start on the word after `as`, and covers that word", () => {
    const { documents } = workspaceOf(SOURCE);
    const range = canRename(documents.get(URI), documents.tree(URI), positionOf(SOURCE, "raffles (O.S.)", 1)) as any;
    expect(range && documents.get(URI)!.getText(range)).toBe("raffles");
  });

  test("renaming from the word after `as` renames the define", () => {
    const text = renamed(SOURCE, "raffles (O.S.)", 1, "arthur");
    expect(text).toContain("define arthur as character with");
    expect(text).toContain("  ??? as arthur:\n");
    expect(text).toContain("  BUNNY as arthur (O.S.):\n");
  });
});

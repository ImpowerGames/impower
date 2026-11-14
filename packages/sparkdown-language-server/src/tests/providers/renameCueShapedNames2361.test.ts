import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getRenameEdits } from "../../utils/providers/getRenameEdits";

const URI = "file:///provider.sd";

const INVALID_NAME =
  "is not a valid name. A name starts with a letter or _ and has only letters, digits and _, with an @ allowed between two of them.";

const SOURCE = `define raffles as character with
  name = "RAFFLES"
  aliases = { "STRANGER", "???" }
end

define bunny as character with
  name = "BUNNY"
  aliases = { "???", 'VISITOR' }
end

scene start
  STRANGER:
    Bunny--?
  RAFFLES:
    It's me.
  ???:
    Who is there?
  BUNNY:
    Oh.
  raffles:
    Me again.
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
  if (index < 0) throw new Error(`${needle} #${occurrence} is not in the source`);
  const offset = index + 1;
  const before = source.slice(0, offset);
  return { line: before.split("\n").length - 1, character: offset - (before.lastIndexOf("\n") + 1) };
}

function renamed(needle: string, occurrence: number, newName: string) {
  const { documents, workspace } = workspaceOf(SOURCE);
  const edits = getRenameEdits(
    undefined,
    documents.get(URI),
    documents.tree(URI),
    undefined,
    workspace,
    newName,
    positionOf(SOURCE, needle, occurrence),
  );
  let text = SOURCE;
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

describe("renaming a character's shown names to a cue-shaped name (#2361)", () => {
  test.each([
    ["the `name` string", "RAFFLES", 1],
    ["a cue matched through the `name` string", "RAFFLES", 2],
  ])("renaming %s to a cue-shaped name renames the name and its cues", (_label, needle, occurrence) => {
    for (const newName of ["STRANGER?", "King Arthur"]) {
      const text = renamed(needle, occurrence, newName);
      expect(text).toContain(`name = "${newName}"`);
      expect(text).toContain(`  ${newName}:\n    It's me.`);
      expect(text).toContain("  STRANGER:\n    Bunny--?");
      expect(text).toContain("  raffles:\n    Me again.");
      expect(text).toContain("define raffles as character with");
    }
  });

  test.each([
    ["an `aliases` entry", "STRANGER", 1],
    ["a cue matched through an alias", "STRANGER", 2],
  ])("renaming %s to a cue-shaped name renames the alias and its cues", (_label, needle, occurrence) => {
    for (const newName of ["STRANGER?", "King Arthur", "O'BRIEN"]) {
      const text = renamed(needle, occurrence, newName);
      expect(text).toContain(`aliases = { "${newName}", "???" }`);
      expect(text).toContain(`  ${newName}:\n    Bunny--?`);
      expect(text).toContain(`name = "RAFFLES"`);
      expect(text).toContain("  RAFFLES:\n    It's me.");
    }
  });

  test.each([
    ["a cue that matches a define name", "raffles:", 1],
    ["a define name", "raffles", 1],
  ])("renaming %s to a non-identifier is refused with the name message", (_label, needle, occurrence) => {
    expect(() => renamed(needle, occurrence, "King Arthur")).toThrow(`King Arthur ${INVALID_NAME}`);
  });

  test.each([
    ["a colon", "KING: ARTHUR"],
    ["a brace", "KING {ARTHUR}"],
    ["a backslash", "KING\\ARTHUR"],
    ["the string's own quote", 'KING "ARTHUR"'],
    ["a line comment", "KING // ARTHUR"],
    ["a block comment", "KING /* ARTHUR"],
    ["a trailing parenthetical", "KING (V.O.)"],
    ["a trailing position", "KING [left]"],
    ["leading space", " KING"],
    ["trailing space", "KING "],
    ["a line break", "KING\nARTHUR"],
    ["nothing", ""],
  ])("renaming a `name` string to a target with %s is refused", (_label, newName) => {
    expect(() => renamed("RAFFLES", 1, newName)).toThrow(/is not a valid cue name/);
  });

  test("an alias in single quotes refuses a target holding a single quote", () => {
    expect(() => renamed("VISITOR", 1, "O'BRIEN")).toThrow(/is not a valid cue name/);
  });

  test("renaming an alias two characters share renames it in both defines and every shared cue", () => {
    const text = renamed("???", 1, "WHO?");
    expect(text).toContain(`aliases = { "STRANGER", "WHO?" }`);
    expect(text).toContain(`aliases = { "WHO?", 'VISITOR' }`);
    expect(text).toContain("  WHO?:\n    Who is there?");
    expect(text).toContain("  STRANGER:\n    Bunny--?");
  });
});

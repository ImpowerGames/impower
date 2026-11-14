import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getReferences } from "../../utils/providers/getReferences";
import { getRenameEdits } from "../../utils/providers/getRenameEdits";
import { compileProject, complete } from "./completionHarness";

const URI = "file:///provider.sd";

const SOURCE = `define raffles as character with
  name = "RAFFLES"
  aliases = { "STRANGER", "VISITOR" }
end

scene start
  STRANGER:
    Bunny--?
  RAFFLES:
    It's me.
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

describe("a character's aliases in the editor (#2282)", () => {
  test("cue completion offers each character's aliases", () => {
    const program = compileProject(SOURCE);
    const at = complete(SOURCE.replace("  RAFFLES:\n", "  V@1\n  RAFFLES:\n"), { program });
    expect(at.labels).toContain("VISITOR");
    expect(at.detail("VISITOR")).toBe("character");
  }, 60000);

  test("renaming the alias in the define renames the cue that uses it", () => {
    const text = renamed("STRANGER", 1, "NEWCOMER");
    expect(text).toContain(`aliases = { "NEWCOMER", "VISITOR" }`);
    expect(text).toContain("  NEWCOMER:\n    Bunny--?");
    expect(text).toContain("  RAFFLES:\n    It's me.");
    expect(text).toContain(`name = "RAFFLES"`);
  });

  test("renaming from the cue renames the alias in the define", () => {
    const text = renamed("STRANGER", 2, "NEWCOMER");
    expect(text).toContain(`aliases = { "NEWCOMER", "VISITOR" }`);
    expect(text).toContain("  NEWCOMER:\n    Bunny--?");
    expect(text).toContain(`name = "RAFFLES"`);
  });

  test.each([
    ["an escaped alias", `aliases = { "\\86ISITOR" }`, "\\86ISITOR"],
    ["an escaped `name`", `name = "\\86ISITOR"`, "\\86ISITOR"],
  ])("go to definition on a cue lands on %s that spells it", (_label, field, declared) => {
    const source = `define raffles as character with\n  ${field}\nend\n\nscene start\n  VISITOR:\n    Hello.\nend\n`;
    const { documents, workspace } = workspaceOf(source);
    const { references } = getReferences(
      documents.get(URI),
      documents.tree(URI),
      undefined,
      workspace,
      positionOf(source, "VISITOR", 1),
      {
        searchOtherFiles: true,
        includeDeclaration: true,
        excludeUses: true,
        includeInterdependent: false,
        includeLinks: false,
      },
    );
    expect(
      (references ?? []).map((r) => ({ text: documents.get(URI)!.getText(r.range), line: r.range.start.line })),
    ).toEqual([{ text: declared, line: 1 }]);
  });

  test("go to definition on the cue lands on the alias in the define", () => {
    const { documents, workspace } = workspaceOf(SOURCE);
    const { references } = getReferences(
      documents.get(URI),
      documents.tree(URI),
      undefined,
      workspace,
      positionOf(SOURCE, "STRANGER", 2),
      {
        searchOtherFiles: true,
        includeDeclaration: true,
        excludeUses: true,
        includeInterdependent: false,
        includeLinks: false,
      },
    );
    expect(
      (references ?? []).map((r) => ({ text: documents.get(URI)!.getText(r.range), line: r.range.start.line })),
    ).toEqual([{ text: "STRANGER", line: 2 }]);
  });
});

import "@impower/sparkdown/src/inkjs/engine/Container";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { isExplicitRuleName } from "@impower/sparkdown/src/compiler/utils/explicitRuleNames";
import { expect, test } from "vitest";
import { canRename } from "../../utils/providers/canRename";
import { getReferences } from "../../utils/providers/getReferences";
import { getRenameEdits } from "../../utils/providers/getRenameEdits";
import { getSymbol } from "../../utils/providers/getSymbol";

const URI = "file:///bounded-define-rename.sd";

function open(source: string) {
  const documents = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
  documents.set({ textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" } });
  const document = documents.get(URI)!;
  const tree = documents.tree(URI)!;
  // The registry normalizes CRLF to LF. All offsets below use its document.
  const text = document.getText();
  const offset = text.indexOf("ALICE");
  expect(offset).toBeGreaterThanOrEqual(0);
  const position = document.positionAt(offset + 2);
  const nameRange = document.range(offset, offset + "ALICE".length);
  const cueOffset = text.lastIndexOf("ALICE");
  const cueRange = document.range(cueOffset, cueOffset + "ALICE".length);
  const workspace = {
    annotations: (uri: string) => documents.annotations(uri),
    document: (uri: string) => documents.get(uri),
    uris: () => [...documents.keys()],
    compilerConfig: undefined,
    findFiles: () => [],
  } as any;
  return { document, tree, text, position, nameRange, cueRange, workspace };
}

for (const [lineEnding, newline] of [["LF", "\n"], ["CRLF", "\r\n"]] as const) {
  for (const prefix of ["", "& "]) {
    const label = `${prefix ? "marked" : "canonical"} ${lineEnding}`;
    const source = [
      `${prefix}define hero as character with name = "ALICE" end`,
      "ALICE:",
      "  Hello.",
      "",
    ].join(newline);

    test(`${label}: symbol is the character name content without quotes`, () => {
      const { document, tree, position, nameRange } = open(source);
      const result = getSymbol(document, tree, position);
      expect(isExplicitRuleName(result.symbol?.name, "LuauDoubleQuotedString_content")).toBe(true);
      expect(result.canRename).toBe(true);
      expect(result.nameRange).toEqual(nameRange);
      expect(document.getText(result.nameRange)).toBe("ALICE");
    });

    test(`${label}: prepare Rename accepts the exact character name range`, () => {
      const { document, tree, position, nameRange } = open(source);
      expect(canRename(document, tree, position)).toEqual(nameRange);
    });

    test(`${label}: references include the literal and its dialogue cue`, () => {
      const { document, tree, position, nameRange, cueRange, workspace } = open(source);
      const result = getReferences(document, tree, undefined, workspace, position, {
        searchOtherFiles: false,
        includeDeclaration: true,
        includeInterdependent: false,
        includeLinks: false,
      });
      expect(result.references?.map(reference => ({ uri: reference.uri, range: reference.range })))
        .toEqual([{ uri: URI, range: nameRange }, { uri: URI, range: cueRange }]);
    });

    test(`${label}: actual Rename edits change only the name and dialogue cue`, () => {
      const { document, tree, text, position, nameRange, cueRange, workspace } = open(source);
      const result = getRenameEdits(undefined, document, tree, undefined, workspace, "BOB", position);
      const expected = [{ range: nameRange, newText: "BOB" }, { range: cueRange, newText: "BOB" }];
      expect(result?.changes).toEqual({ [URI]: expected });
      expect(result?.documentChanges).toEqual([{ textDocument: { uri: URI, version: 1 }, edits: expected }]);
      let renamed = text;
      for (const edit of [...(result?.changes?.[URI] ?? [])].sort((a, b) => document.offsetAt(b.range.start) - document.offsetAt(a.range.start))) {
        renamed = renamed.slice(0, document.offsetAt(edit.range.start)) + edit.newText + renamed.slice(document.offsetAt(edit.range.end));
      }
      expect(renamed).toBe(text.replaceAll("ALICE", "BOB"));
      expect(renamed).toContain('name = "BOB" end\nBOB:\n');
    });
  }
}

for (const prefix of ["", "& "]) {
  test.each([
    `${prefix}store label = "ALICE"\n`,
    `${prefix}define hero as character with description = "ALICE" end\n`,
    `${prefix}define hero as audio with name = "ALICE" end\n`,
  ])("unrelated string does not become a character Rename target: %s", source => {
    const { document, tree, position } = open(source);
    expect(getSymbol(document, tree, position).canRename).not.toBe(true);
    expect(canRename(document, tree, position)).toBeNull();
  });
}

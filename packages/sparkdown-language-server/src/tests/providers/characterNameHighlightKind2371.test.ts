import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { DocumentHighlightKind } from "vscode-languageserver";
import { describe, expect, test } from "vitest";
import { getReferences } from "../../utils/providers/getReferences";

const URI = "file:///provider.sd";

const SOURCE = `define raffles as character with
  name = "RAFFLES"
  aliases = { "STRANGER", "???" }
end

scene start
  STRANGER:
    Bunny--?
  RAFFLES:
    It's me.
end
`;

function highlightsAt(line: number, character: number) {
  const documents = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
  documents.set({ textDocument: { uri: URI, text: SOURCE, version: 1, languageId: "sparkdown" } });
  const workspace = {
    annotations: (uri: string) => documents.annotations(uri),
    document: (uri: string) => documents.get(uri),
    tree: (uri: string) => documents.tree(uri),
    uris: () => [...documents.keys()],
    compilerConfig: undefined,
    findFiles: () => [],
  } as any;
  const { references } = getReferences(
    documents.get(URI),
    documents.tree(URI),
    undefined,
    workspace,
    { line, character },
    { searchOtherFiles: false, includeDeclaration: true, includeInterdependent: true, includeLinks: true },
  );
  const document = documents.get(URI)!;
  return (references ?? [])
    .filter(
      (r) =>
        r.range.start.line === line &&
        r.range.start.character <= character &&
        character <= r.range.end.character,
    )
    .map((r) => ({ text: document.getText(r.range), kind: r.kind }));
}

describe("the web editor can start a rename from a character's shown names (#2371)", () => {
  test.each([
    ["the `name` string", 1, 11, "RAFFLES"],
    ["an `aliases` entry", 2, 17, "STRANGER"],
    ["the cue", 6, 4, "STRANGER"],
  ])("the highlight under the caret in %s is a name, not plain text", (_label, line, character, text) => {
    const under = highlightsAt(line, character);
    expect(under.map((h) => h.text)).toEqual([text]);
    expect(under[0]!.kind).not.toBe(DocumentHighlightKind.Text);
  });
});

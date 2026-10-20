// A structural word whose rule holds no arms names a value (I-1310), so the
// locals declared after its call on the same line are in scope where any
// other call's would be.
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getDeclarationScopes } from "../../utils/annotations/getDeclarationScopes";

const URI = "file:///main.sd";

/** The names of every kind in scope at the cursor, written `@`, outside any section. */
function namesAt(source: string): string[] {
  const offset = source.indexOf("@");
  const text = source.slice(0, offset) + source.slice(offset + 1);
  const documents = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
  documents.set({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  const scripts = new Map([[URI, {
    annotations: documents.annotations(URI),
    tree: documents.tree(URI),
    read: (from: number, to: number) => documents.get(URI)!.read(from, to),
  }]]);
  const scopes = getDeclarationScopes(scripts as never, { uri: URI, offset });
  return Object.values(scopes[""] ?? {}).flat() as string[];
}

describe("declarations in scope after a call of a structural word", () => {
  const source = (name: string) =>
    `function f()\n  local ${name} = function(n) return n end\n  ${name}(1) local after = 7\n  local function later() end\n  print(@)\nend\n`;

  test("the control call of another name keeps both locals in scope", () => {
    expect(namesAt(source("hp"))).toEqual(expect.arrayContaining(["after", "later"]));
  });

  for (const word of ["queue", "cycle", "chain", "shuffle", "match", "plural"]) {
    test(`a call of ${word} keeps both locals in scope`, () => {
      expect(namesAt(source(word))).toEqual(expect.arrayContaining(["after", "later"]));
    });
  }

  test("a local declared in an alternator's arm stays in that arm", () => {
    const text = "function f()\n  queue\n    | local inside = 1\n    | print(1)\n  end\n  print(@)\nend\n";
    expect(namesAt(text)).not.toContain("inside");
  });
});

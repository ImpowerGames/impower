import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getReferences } from "../../utils/providers/getReferences";
import { getRenameEdits } from "../../utils/providers/getRenameEdits";

// End-to-end (provider) contract for the de-staled define/struct references.
// getReferences / getRenameEdits / getSymbol / getSymbolIds must locate a define
// symbol at the cursor and match it against its uses by the symbol-IDs the
// ReferenceAnnotator emits. Built on a worker-free registry (no compiled
// program needed — these references resolve by plain symbol-ID equality /
// interdependency), with a minimal workspace shim exposing only what the
// providers read.

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
    uris: () => [...documents.keys()],
    compilerConfig: undefined,
    findFiles: () => [],
  } as any;
  return { documents, workspace };
}

// Offset of the Nth (1-based) occurrence of `needle`, plus an in-token nudge.
function posAt(source: string, needle: string, occurrence = 1) {
  let idx = -1;
  for (let i = 0; i < occurrence; i++) {
    idx = source.indexOf(needle, idx + 1);
  }
  const offset = idx + 1; // inside the token
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
    // One reference is the define (line 0), one is the cue (line 3).
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

describe("provider · screen/style layer interdependency (D2)", () => {
  const source = `screen s with
  backdrop:
    image = "bg"
end
style backdrop with
  background-color = black
end
`;

  test("find-references on a screen layer reaches the same-named style block", () => {
    const { documents, workspace } = makeWorkspace(source);
    const { references } = getReferences(
      documents.get(URI),
      documents.tree(URI),
      undefined,
      workspace,
      posAt(source, "backdrop", 1), // the screen layer
      {
        searchOtherFiles: false,
        includeDeclaration: true,
        includeInterdependent: true,
        includeLinks: false,
      },
    );
    const lines = (references ?? []).map((r) => r.range.start.line);
    // The screen layer is on line 1; the `style backdrop` block name on line 4.
    expect(lines).toContain(1);
    expect(lines).toContain(4);
  });
});

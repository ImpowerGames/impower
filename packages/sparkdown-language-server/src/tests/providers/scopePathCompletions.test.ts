import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { describe, expect, test } from "vitest";
import { getCompletions } from "../../utils/providers/getCompletions";
import { getParentSectionPath } from "../../utils/syntax/getParentSectionPath";

// The scope path a completion is resolved against is the enclosing scene and
// branch, which is how getDeclarationScopes files parameters, labels and
// branches. A function body inside a scene resolves to that scene's path, so
// identifier completion there offers the function's own parameters and the
// enclosing scene's branches, and not a parameter declared under another
// scene. A function at the top of the file resolves to the global path.

const URI = "file:///scope.sd";

function setup(source: string) {
  const documents = new SparkdownDocumentRegistry([
    "characters",
    "declarations",
    "references",
  ]);
  documents.set({
    textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" },
  });
  const scriptAnnotations = new Map([[URI, documents.annotations(URI)]]);
  return { documents, scriptAnnotations };
}

function positionAt(source: string, marker = "|") {
  const idx = source.indexOf(marker);
  const text = source.replace(marker, "");
  const before = source.slice(0, idx);
  const line = before.split("\n").length - 1;
  const character = idx - (before.lastIndexOf("\n") + 1);
  return { text, position: { line, character }, offset: idx };
}

function scopePathAt(source: string) {
  const { text, offset } = positionAt(source);
  const { documents } = setup(text);
  const stack = getStack<SparkdownNodeName>(documents.tree(URI)!, offset, -1);
  return getParentSectionPath(stack, (from, to) =>
    documents.get(URI)!.read(from, to),
  );
}

function completionLabelsAt(source: string) {
  const { text, position } = positionAt(source);
  const { documents, scriptAnnotations } = setup(text);
  const items = getCompletions(
    documents.get(URI),
    documents.tree(URI),
    scriptAnnotations,
    undefined,
    undefined,
    position,
    undefined,
  );
  return (items ?? []).map((i) => i.label);
}

// `@@` marks the completion point inside `helper`; `##` the one inside
// `other`. The unused marker's whole line is dropped so no whitespace-only
// line is left behind in the other function's body.
const SCRIPT = `scene intro
  (start)
  Hello.
  branch inner
    (deeper)
    function helper(alpha, beta)
      @@
    end
  end
end

scene elsewhere
  (far)
  function other(gamma)
    ##
  end
end
`;

const dropLine = (script: string, marker: string) =>
  script.replace(new RegExp(`^.*${marker}.*\\n`, "m"), "");
const inHelper = (text: string) => dropLine(SCRIPT, "##").replace("@@", text);
const inOther = (text: string) => dropLine(SCRIPT, "@@").replace("##", text);

const AT_TOP = `function helper(alpha)
  |
end

scene intro
  (start)
  Hello.
end
`;

describe("provider · scope path", () => {
  test("a function body inside a branch resolves to scene.branch", () => {
    expect(scopePathAt(inHelper("|"))).toEqual(["intro", "inner"]);
  });

  test("a function body inside a later scene resolves to that scene", () => {
    expect(scopePathAt(inOther("|"))).toEqual(["elsewhere"]);
  });

  test("a function body at the top of the file resolves to the global scope", () => {
    expect(scopePathAt(AT_TOP)).toEqual([]);
  });

  test("identifier completion inside a function offers its own parameters and the enclosing scene's branches", () => {
    const labels = completionLabelsAt(inHelper("return al|"));
    expect(labels).toContain("alpha");
    expect(labels).toContain("beta");
    expect(labels).toContain("inner");
    expect(labels).not.toContain("gamma");
  });

  test("identifier completion inside a function in another scene does not offer the first scene's names", () => {
    const labels = completionLabelsAt(inOther("return ga|"));
    expect(labels).toContain("gamma");
    expect(labels).not.toContain("alpha");
    expect(labels).not.toContain("inner");
  });
});

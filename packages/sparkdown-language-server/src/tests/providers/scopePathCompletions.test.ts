import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { describe, expect, test } from "vitest";
import { getDeclarationScopes } from "../../utils/annotations/getDeclarationScopes";
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
  const scriptAnnotations = new Map([[URI, { annotations: documents.annotations(URI), read: (from: number, to: number) => documents.get(URI)!.read(from, to) }]]);
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

// Each `choose` closes with its own `end`. A branch's `end` closes the branch,
// so a label after it belongs to the scene again, and a scene's `end` returns
// to the global scope. `|` marks the completion point; `@@` in CLOSED_BRANCH
// is the one inside the branch, and `##` the one after the scene's `end`.
const CLOSED_BRANCH = `scene A
  choose
    * Go
      Went.
  then (first)
    -> |
  end
  branch x
    choose
      * Stay
        Stayed.
    then (inside)
      -> @@
    end
  end
  choose
    * Again
      Again.
  then (after)
    After the branch.
  end
end
##
`;

// Keeps `marker` as the `|` completion point and removes the other markers;
// `"none"` removes all three.
const atMarker = (marker: "|" | "@@" | "##" | "none") =>
  ["|", "@@", "##"].reduce(
    (script, m) => script.replace(m, m === marker ? "|" : ""),
    CLOSED_BRANCH,
  );

describe("provider · scope after a closed branch", () => {
  test("the scope map files a label after a branch's end under the scene", () => {
    const { scriptAnnotations } = setup(atMarker("none"));
    const scopes = getDeclarationScopes(scriptAnnotations);
    expect(scopes["A"]?.label).toEqual(["first", "after"]);
    expect(scopes["A.x"]?.label).toEqual(["inside"]);
  });

  test("an end that closes a block or function inside the scene does not close the scene", () => {
    const { scriptAnnotations } = setup(`scene A
  if true then
    Yes.
  end
  function helper()
    return 1
  end
  choose
    * Go
      Went.
  then (later)
    Later.
  end
end
`);
    expect(getDeclarationScopes(scriptAnnotations)["A"]?.label).toEqual([
      "later",
    ]);
    expect(
      scopePathAt(`scene A
  if true then
    Yes.
  end
  function helper()
    return 1
  end
  Later.|
end
`),
    ).toEqual(["A"]);
  });

  test("a cursor after a branch's end resolves to the scene", () => {
    const script = atMarker("none").replace(
      "After the branch.",
      "After the branch.|",
    );
    expect(scopePathAt(script)).toEqual(["A"]);
  });

  test("a cursor after a scene's end resolves to the global scope", () => {
    expect(scopePathAt(atMarker("##"))).toEqual([]);
  });

  test("divert completion in the scene offers its labels on both sides of the branch", () => {
    const labels = completionLabelsAt(atMarker("|"));
    expect(labels).toContain("first");
    expect(labels).toContain("after");
    expect(labels).not.toContain("inside");
  });

  test("divert completion inside the branch offers its own label and the scene's", () => {
    const labels = completionLabelsAt(atMarker("@@"));
    expect(labels).toContain("inside");
    expect(labels).toContain("first");
    expect(labels).toContain("after");
  });

  test("a scope left open by one script does not reach into the next", () => {
    // `unclosed.sd` is missing both of its `end`s.
    const documents = new SparkdownDocumentRegistry(["declarations"]);
    const scripts = new Map(
      Object.entries({
        "file:///unclosed.sd": "scene B\n  branch y\n    Why.\n",
        "file:///next.sd": `choose
  * Go
    Went.
then (toplabel)
  Top.
end
scene C
end
`,
      }).map(([uri, text]) => {
        documents.set({
          textDocument: { uri, text, version: 1, languageId: "sparkdown" },
        });
        return [
          uri,
          {
            annotations: documents.annotations(uri),
            read: (from: number, to: number) =>
              documents.get(uri)!.read(from, to),
          },
        ];
      }),
    );
    expect(getDeclarationScopes(scripts)[""]?.label).toEqual(["toplabel"]);
  });

  test("a scene left without its end is not reopened after a later scene closes", () => {
    expect(
      scopePathAt("scene A\n  Hi.\nscene B\n  Bye.\nend\n|\n"),
    ).toEqual([]);
  });

  test("a branch left without its end is not reopened after a later branch closes", () => {
    expect(
      scopePathAt(
        "scene A\n  branch x\n    X.\n  branch y\n    Y.\n  end\n  |\nend\n",
      ),
    ).toEqual(["A"]);
  });

  test("a parameter is not offered in a branch whose name its branch prefixes", () => {
    const labels = completionLabelsAt(`scene A
  branch x
    function f(alpha)
      return alpha
    end
  end
  branch xy
    function g(beta)
      return al|
    end
  end
end
`);
    expect(labels).toContain("beta");
    expect(labels).not.toContain("alpha");
  });

  test("a branch's labels are not offered in a branch whose name it prefixes", () => {
    const labels = completionLabelsAt(`scene A
  branch x
    choose
      * Stay
        Stayed.
    then (inx)
      In x.
    end
  end
  branch xy
    choose
      * Stay
        Stayed.
    then (inxy)
      -> |
    end
  end
end
`);
    expect(labels).toContain("inxy");
    expect(labels).not.toContain("inx");
  });
});

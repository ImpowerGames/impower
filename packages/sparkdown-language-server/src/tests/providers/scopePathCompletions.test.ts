import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { describe, expect, test } from "vitest";
import { getDeclarationScopes } from "../../utils/annotations/getDeclarationScopes";
import { getParentSectionPath } from "../../utils/syntax/getParentSectionPath";
import { labelsAt } from "./completionHarness";

// The scope path a completion is resolved against is the enclosing scene and
// branch, which is how getDeclarationScopes files scene and branch
// parameters, labels and branches. A function body inside a scene resolves to
// that scene's path, so identifier completion there offers the enclosing
// scene's branches. A function's own parameters are scoped to its body, so a
// parameter of a function under another scene is not offered. A function at
// the top of the file resolves to the global path.

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
  const scriptAnnotations = new Map([[URI, { annotations: documents.annotations(URI), tree: documents.tree(URI), read: (from: number, to: number) => documents.get(URI)!.read(from, to) }]]);
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

const completionLabelsAt = (source: string) =>
  labelsAt(source.replace("|", "@0"));

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
    const scopes = getDeclarationScopes(scriptAnnotations, { uri: URI, offset: 0 });
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
    expect(getDeclarationScopes(scriptAnnotations, { uri: URI, offset: 0 })["A"]?.label).toEqual([
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

  test("divert completion after a scene's end does not offer the scene's labels", () => {
    const labels = completionLabelsAt(atMarker("##").replace("|", "-> |"));
    expect(labels).toContain("A");
    expect(labels).not.toContain("first");
    expect(labels).not.toContain("after");
    expect(labels).not.toContain("inside");
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
            tree: documents.tree(uri),
            read: (from: number, to: number) =>
              documents.get(uri)!.read(from, to),
          },
        ];
      }),
    );
    expect(getDeclarationScopes(scripts, { uri: "file:///next.sd", offset: 0 })[""]?.label).toEqual(["toplabel"]);
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

// A type at the end of a line takes in the line breaks after it, since the
// next line may continue it as a union, so the declaration's node ends lines
// after its text. `@@` marks the cursor, since `|` is a union's operator.
describe("provider · scope after a type that ends its line", () => {
  const namesAt = (source: string, type: "var" | "param") => {
    const { text, offset } = positionAt(source, "@@");
    const { scriptAnnotations } = setup(text);
    return getDeclarationScopes(scriptAnnotations, { uri: URI, offset })[""]?.[type] ?? [];
  };

  test.each([
    ["a typed local", "function f()\n  local x: number\n@@\n  print(x)\nend\n", "var", "x"],
    ["a typed local whose union goes on to the next line", "function f()\n  local x: number\n    | string\n@@\n  print(x)\nend\n", "var", "x"],
    ["a parameter of a function with a return type", "function f(p): number\n@@\n  return p\nend\n", "param", "p"],
  ] as const)("%s is in scope on the blank line after it", (_name, source, type, name) => {
    expect(namesAt(source, type)).toContain(name);
  });

  test.each([
    ["with no body statement", "function f(p): typeof(p@@) end\n"],
    ["with a body statement", "function f(p): typeof(p@@)\n  return p\nend\n"],
  ])("a parameter is not in scope in its function's return type %s", (_name, source) => {
    expect(namesAt(source, "param")).not.toContain("p");
  });

  test("a local is not in scope in the value of a union line that continues its type", () => {
    const source = "function f()\n  local v: number\n  -- note\n  | string = @@\n  return v\nend\n";
    expect(namesAt(source, "var")).not.toContain("v");
    expect(namesAt(source.replace("= @@\n  return v", "= 5\n  return @@"), "var")).toContain("v");
  });

  test("a local is not in scope after the `=` on its own line", () => {
    expect(namesAt("function f()\n  local a = @@\nend\n", "var")).not.toContain("a");
  });

  test("locals are not in scope in a function value in their own initializer", () => {
    const names = namesAt(
      "function f()\n  local a, g = 1, function()\n    return @@\n  end\n  print(a)\nend\n",
      "var",
    );
    expect(names).not.toContain("a");
    expect(names).not.toContain("g");
  });
});

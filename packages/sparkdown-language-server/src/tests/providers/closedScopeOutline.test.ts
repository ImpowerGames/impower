import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, test } from "vitest";
import { getDocumentSymbols } from "../../utils/providers/getDocumentSymbols";
import { getFoldingRanges } from "../../utils/providers/getFoldingRanges";

// The outline and the heading folds end a scene or branch at its `end`, so a
// label or branch declared after a branch's `end` belongs to the scene again.

const URI = "file:///outline.sd";

// Line numbers (from 0) are what the assertions below refer to.
const CLOSED_BRANCH = `scene A
  choose
    * Go
      Went.
  then (first)
    Hi.
  end
  branch x
    choose
      * Stay
        Stayed.
    then (inside)
      Inside the branch.
    end
  end
  choose
    * Again
      Again.
  then (after)
    After the branch.
  end
  branch y
    Why.
  end
end
`;

function setup(source: string) {
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  documents.set({
    textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" },
  });
  return {
    document: documents.get(URI)!,
    annotations: documents.annotations(URI),
    tree: documents.tree(URI),
  };
}

describe("provider · outline and folding after a closed branch", () => {
  test("the outline places a label after a branch's end in the scene", () => {
    const { document, annotations, tree } = setup(CLOSED_BRANCH);
    const [scene, ...rest] = getDocumentSymbols(document, annotations, tree);
    expect(rest).toEqual([]);
    expect(scene?.name).toBe("A");
    expect(scene?.children?.map((s) => s.name)).toEqual([
      "first",
      "x",
      "after",
      "y",
    ]);
    const x = scene?.children?.find((s) => s.name === "x");
    expect(x?.children?.map((s) => s.name)).toEqual(["inside"]);
  });

  test("the outline ends each scene and branch at its end", () => {
    const { document, annotations, tree } = setup(CLOSED_BRANCH);
    const [scene] = getDocumentSymbols(document, annotations, tree);
    const range = (name: string) => {
      const s = scene?.children?.find((c) => c.name === name);
      return [s?.range.start.line, s?.range.end.line];
    };
    expect([scene?.range.start.line, scene?.range.end.line]).toEqual([0, 24]);
    expect(range("x")).toEqual([7, 14]);
    expect(range("y")).toEqual([21, 23]);
  });

  test("each scene and branch folds up to its end", () => {
    const { document, annotations, tree } = setup(CLOSED_BRANCH);
    const folds = getFoldingRanges(document, annotations, {} as SparkProgram, tree)
      .filter((f) => f.kind === "scene" || f.kind === "branch")
      .map((f) => [f.kind, f.startLine, f.endLine]);
    expect(folds).toEqual([
      ["scene", 0, 24],
      ["branch", 7, 14],
      ["branch", 21, 23],
    ]);
  });
});

// A function inside a branch, a label in the scene after the branch closes,
// and a label outside every scene.
const NESTED_FUNCTION = `scene A
  branch x
    function helper()
      return 1
    end
  end
  choose
    * Again
      Again.
  then (after)
    After.
  end
end
choose
  * Top
    Top.
then (toplabel)
  Top.
end
`;

describe("provider · outline and folding around a nested function", () => {
  test("a function inside a branch is nested there and ends at its own end", () => {
    const { document, annotations, tree } = setup(NESTED_FUNCTION);
    const symbols = getDocumentSymbols(document, annotations, tree);
    expect(symbols.map((s) => s.name)).toEqual(["A", "toplabel"]);
    const [scene] = symbols;
    expect([scene?.range.start.line, scene?.range.end.line]).toEqual([0, 12]);
    expect(scene?.children?.map((s) => s.name)).toEqual(["x", "after"]);
    const x = scene?.children?.[0];
    expect([x?.range.start.line, x?.range.end.line]).toEqual([1, 5]);
    expect(x?.children?.map((s) => s.name)).toEqual(["helper"]);
    const helper = x?.children?.[0];
    expect([helper?.range.start.line, helper?.range.end.line]).toEqual([2, 4]);
  });

  test("a stray end does not reopen a scene the next scene already closed", () => {
    // Scene A is missing its `end`; the last `end` is stray.
    const { document, annotations, tree } = setup(
      "scene A\n  Hi.\nscene B\n  Bye.\nend\nend\n",
    );
    const ranges = getDocumentSymbols(document, annotations, tree).map((s) => [
      s.name,
      s.range.start.line,
      s.range.end.line,
    ]);
    expect(ranges).toEqual([
      ["A", 0, 1],
      ["B", 2, 4],
    ]);
  });

  test("a top-level function folds up to its own end, the range the outline gives it", () => {
    const { document, annotations, tree } = setup(
      "function helper()\n  return 1\nend\nchoose\n  * Top\n    Top.\nthen (toplabel)\n  Top.\nend\n",
    );
    const [helper] = getDocumentSymbols(document, annotations, tree);
    expect([helper?.range.start.line, helper?.range.end.line]).toEqual([0, 2]);
    const folds = getFoldingRanges(document, annotations, {} as SparkProgram, tree)
      .filter((f) => f.kind === "function")
      .map((f) => [f.startLine, f.endLine]);
    expect(folds).toEqual([[0, 2]]);
  });

  test("a function declared inside another function is its child", () => {
    const { document, annotations, tree } = setup(`scene A
  function outer()
    function inner()
      return 1
    end
    return inner
  end
end
`);
    const [scene] = getDocumentSymbols(document, annotations, tree);
    expect(scene?.children?.map((s) => s.name)).toEqual(["outer"]);
    const outer = scene?.children?.[0];
    expect([outer?.range.start.line, outer?.range.end.line]).toEqual([1, 6]);
    expect(outer?.children?.map((s) => s.name)).toEqual(["inner"]);
  });

  test("a function inside a branch folds up to its own end", () => {
    const { document, annotations, tree } = setup(NESTED_FUNCTION);
    const folds = getFoldingRanges(document, annotations, {} as SparkProgram, tree)
      .filter((f) => f.kind !== "indent")
      .map((f) => [f.kind, f.startLine, f.endLine]);
    expect(folds).toEqual([
      ["scene", 0, 12],
      ["branch", 1, 5],
      ["function", 2, 4],
    ]);
  });
});

// Luau does not require a function body to be indented, so a function's
// extent comes from its definition in the tree, not from indentation.
describe("provider · outline and folding of unindented functions", () => {
  test("a function whose body is not indented spans to its own end", () => {
    const { document, annotations, tree } = setup(
      "function run()\nlocal n = 0\n-- a note\nreturn n\nend\n",
    );
    const [run] = getDocumentSymbols(document, annotations, tree);
    expect([run?.range.start.line, run?.range.end.line]).toEqual([0, 4]);
    const folds = getFoldingRanges(document, annotations, {} as SparkProgram, tree)
      .filter((f) => f.kind === "function")
      .map((f) => [f.startLine, f.endLine]);
    expect(folds).toEqual([[0, 4]]);
  });

  test("an unindented function inside another is its child", () => {
    const { document, annotations, tree } = setup(
      "function outer()\nfunction inner()\nreturn 1\nend\nreturn inner\nend\n",
    );
    const symbols = getDocumentSymbols(document, annotations, tree);
    expect(symbols.map((s) => s.name)).toEqual(["outer"]);
    const [outer] = symbols;
    expect([outer?.range.start.line, outer?.range.end.line]).toEqual([0, 5]);
    expect(outer?.children?.map((s) => s.name)).toEqual(["inner"]);
    const inner = outer?.children?.[0];
    expect([inner?.range.start.line, inner?.range.end.line]).toEqual([1, 3]);
  });
});

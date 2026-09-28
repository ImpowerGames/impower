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
  };
}

describe("provider · outline and folding after a closed branch", () => {
  test("the outline places a label after a branch's end in the scene", () => {
    const { document, annotations } = setup(CLOSED_BRANCH);
    const [scene, ...rest] = getDocumentSymbols(document, annotations);
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
    const { document, annotations } = setup(CLOSED_BRANCH);
    const [scene] = getDocumentSymbols(document, annotations);
    const range = (name: string) => {
      const s = scene?.children?.find((c) => c.name === name);
      return [s?.range.start.line, s?.range.end.line];
    };
    expect([scene?.range.start.line, scene?.range.end.line]).toEqual([0, 24]);
    expect(range("x")).toEqual([7, 14]);
    expect(range("y")).toEqual([21, 23]);
  });

  test("each scene and branch folds up to its end", () => {
    const { document, annotations } = setup(CLOSED_BRANCH);
    const folds = getFoldingRanges(document, annotations, {} as SparkProgram)
      .filter((f) => f.kind === "scene" || f.kind === "branch")
      .map((f) => [f.kind, f.startLine, f.endLine]);
    expect(folds).toEqual([
      ["scene", 0, 24],
      ["branch", 7, 14],
      ["branch", 21, 23],
    ]);
  });
});

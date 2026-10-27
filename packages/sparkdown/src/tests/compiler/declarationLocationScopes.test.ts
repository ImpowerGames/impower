import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";

// `program.labelLocations` and `program.branchLocations` are keyed by the
// label's or branch's scope path. A branch's `end` closes the branch, so a
// label after it is keyed under the scene again.

const URI = "file://proj/main.sd";

const script = (text: string): File => ({
  uri: URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [script(text)] });
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

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

describe("declaration locations after a closed branch", () => {
  const program = compile(CLOSED_BRANCH);

  it("keys a label after a branch's end under the scene", () => {
    expect(Object.keys(program.labelLocations ?? {}).sort()).toEqual([
      "A.after",
      "A.first",
      "A.x.inside",
    ]);
  });

  it("keys a branch after another branch's end under the scene", () => {
    expect(Object.keys(program.branchLocations ?? {}).sort()).toEqual([
      "A.x",
      "A.y",
    ]);
  });
});

describe("declaration locations around a function inside a branch", () => {
  const program = compile(`scene A
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
`);

  it("keys a label after the branch's end under the scene", () => {
    expect(Object.keys(program.labelLocations ?? {})).toEqual(["A.after"]);
    expect(Object.keys(program.functionLocations ?? {})).toContain("helper");
  });
});

describe("declaration locations after a top-level function", () => {
  const program = compile(`function helper()
  return 1
end
choose
  * Top
    Top.
then (toplabel)
  Top.
end
`);

  it("keys a label after the function's end at the global scope", () => {
    expect(Object.keys(program.labelLocations ?? {})).toEqual(["toplabel"]);
  });
});

// The `end` that closes a scene or branch belongs to that flow, which PLAY
// and the preview at the line read (I-1618).
describe("the header and end lines of the scenes and branches", () => {
  it("lists a scene's with another scene below it", () => {
    const program = compile(`scene start
  First.
  done
end
scene other
  Other.
end
`);
    expect(program.flowEnds).toEqual({
      [URI]: [
        [0, 3, false],
        [4, 6, false],
      ],
    });
  });

  it("lists each branch's and the scene's, and no other block's end", () => {
    const program = compile(CLOSED_BRANCH);
    expect(program.flowEnds).toEqual({
      [URI]: [
        [7, 14, false],
        [21, 23, false],
        [0, 24, false],
      ],
    });
  });

  it("marks the scenes and branches that take parameters", () => {
    const program = compile(`scene start(a)
  branch first
    First.
  end
  branch second(b, c)
    Second.
  end
end
`);
    expect(program.flowEnds).toEqual({
      [URI]: [
        [1, 3, false],
        [4, 6, true],
        [0, 7, true],
      ],
    });
  });
});

describe("declaration locations after a branch left without its end", () => {
  const program = compile(`scene A
  branch x
    choose
      * Stay
        Stayed.
    then (inside)
      In x.
    end
  branch y
    Why.
  end
end
`);

  it("keys the next branch as the scene's, not the open branch's", () => {
    expect(Object.keys(program.branchLocations ?? {}).sort()).toEqual([
      "A.x",
      "A.y",
    ]);
    expect(Object.keys(program.labelLocations ?? {})).toEqual(["A.x.inside"]);
  });
});

// A scene or a branch with nothing between its header and its `end` has an
// address of its own, which its header and its `end` resolve to rather than
// to the first line of the flow below it (I-1618).
import { describe, expect, it } from "vitest";
import { programLocator } from "../../compiler/utils/programLocator";
import { testCompiler } from "../engineUnderTest";

const URI = "inmemory:///main.sd";

const fileOf = (text: string) => ({
  uri: URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

function compile(text: string) {
  const c = testCompiler();
  c.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [fileOf(text)],
  } as never);
  return (c.compile({ textDocument: { uri: URI } } as never) as any).program;
}

/** Where the address of each line stands: its line and its scene. */
const resolved = (text: string, lines: number[]) => {
  const program = compile(text);
  const locator = programLocator(program);
  return lines.map((line) => {
    const address = locator.addressAt(URI, line);
    return [locator.locationOf(address)?.startLine, locator.sceneAt(address)];
  });
};

describe("the address of an empty scene or branch", () => {
  it("is its own for an empty scene's header and end", () => {
    const text = `scene start
end
scene other
  Other.
end
`;
    expect(resolved(text, [0, 1, 3])).toEqual([
      [1, "start"],
      [1, "start"],
      [3, "other"],
    ]);
  });

  it("is its own for an empty branch's header and end", () => {
    const text = `scene start
  branch empty
  end
  branch other
    Other.
  end
end
`;
    expect(resolved(text, [1, 2, 4])).toEqual([
      [2, "start"],
      [2, "start"],
      [4, "start"],
    ]);
  });

  it("is its own for a scene that takes parameters and runs nothing", () => {
    const text = `scene start(a)
end
scene other
  Other.
end
`;
    expect(resolved(text, [0, 1])).toEqual([
      [1, "start"],
      [1, "start"],
    ]);
  });

  it("stands on the first line below the header when only a comment is there", () => {
    const text = `scene start
  // nothing yet
end
scene other
  Other.
end
`;
    expect(resolved(text, [0, 1])).toEqual([
      [1, "start"],
      [1, "start"],
    ]);
  });
});

describe("the last statement of a scene whose content is branches it does not enter", () => {
  const text = `-> start
scene start
  branch needs(a)
    Unused {a}.
    done
  end
end
scene other
  Other.
end
`;

  it("stands on the scene's header, in the scene", () => {
    const program = compile(text);
    const locator = programLocator(program);
    const address = program.chunks.lastStatementAddress(URI, 1);
    expect(address).toBeTypeOf("number");
    expect(locator.locationOf(address)?.startLine).toBe(1);
    expect(locator.sceneAt(address)).toBe("start");
  });

  it("leaves the header falling through to the line below it that has an address", () => {
    expect(resolved(text, [1])).toEqual([[3, "start"]]);
  });
});

describe("whether a scene or branch binds parameters where it is entered", () => {
  it("answers as the compiled entry binds them", () => {
    const wide = " ".repeat(100);
    const program = compile(`scene start(a)
  branch first
    First.
  end
  branch second(b, c)
    Second.
  end
  branch third()
    Third.
  end
  branch fourth(${wide})
    Fourth.
  end
end
`);
    const root = program.chunks;
    expect(
      [0, 1, 4, 7, 10].map((header) => root.bindsParameters(URI, header)),
    ).toEqual([true, false, true, false, false]);
  });
});

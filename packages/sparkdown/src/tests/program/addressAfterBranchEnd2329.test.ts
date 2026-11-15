import { describe, expect, it } from "vitest";
import { programLocator } from "../../compiler/utils/programLocator";
import { testCompiler } from "../engineUnderTest";
import { programCompiler } from "./programHarness";

const URI = "inmemory:///main.sd";

const positionOf = (text: string, find: string, past = 0) => {
  const offset = text.indexOf(find) + past;
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
};

const SCRIPT = `scene start
  Outer.
  branch nested
    Inner.
  end
  x = 1

  After.
end

scene opens_on_a_branch
  branch first
  end
  Outer again.
end
`;

const compile = (text: string) => {
  const c = testCompiler();
  c.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return (c.compile({ textDocument: { uri: URI } } as never) as any).program;
};

describe("the address of a line after a branch's end", () => {
  it.each([
    ["an assignment after a nested branch", 5, 5, "start"],
    ["a beat after a nested branch", 7, 7, "start"],
    ["a beat after an opening empty branch", 13, 13, "opens_on_a_branch"],
  ] as const)("is its own for %s", (_name, line, at, scene) => {
    const locator = programLocator(compile(SCRIPT));
    const address = locator.addressAt(URI, line, { beat: "last" });
    expect([locator.locationOf(address)?.startLine, locator.sceneAt(address)]).toEqual([
      at,
      scene,
    ]);
  });

  it.each([
    ["a beat after a nested branch is reworded", "After.", "After that."],
    ["a line is added after a nested branch", "  After.", "  y = 2\n  After."],
    ["a line is added inside a nested branch", "    Inner.", "    Inner.\n    Deeper."],
    ["the beat after an opening empty branch is reworded", "Outer again.", "Outer once more."],
    ["a line is added inside the opening empty branch", "  branch first\n", "  branch first\n    Inside.\n"],
  ] as const)("matches a cold compile after %s", (_name, find, replace) => {
    const session = programCompiler({ [URI]: SCRIPT }, { seedBuiltinsIntoStory: true });
    session.compile();
    session.compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [
        {
          range: { start: positionOf(SCRIPT, find), end: positionOf(SCRIPT, find, find.length) },
          text: replace,
        },
      ],
    } as never);
    const edited = SCRIPT.replace(find, replace);
    const warm = programLocator(session.compile().program);
    const cold = programLocator(
      programCompiler({ [URI]: edited }, { seedBuiltinsIntoStory: true }).compile().program,
    );
    const where = (locator: typeof warm) =>
      edited.split("\n").map((_, line) => {
        const address = locator.addressAt(URI, line, { beat: "last" });
        return [line, locator.locationOf(address)?.startLine, locator.sceneAt(address)];
      });
    expect(where(warm)).toEqual(where(cold));
  });

  it.each([
    ["the header of a scene that opens on an empty branch", 10],
    ["the header of that empty branch", 11],
    ["the end of that empty branch", 12],
  ] as const)("stays in its own scene at %s", (_name, line) => {
    const locator = programLocator(compile(SCRIPT));
    const address = locator.addressAt(URI, line, { beat: "last" });
    expect(locator.sceneAt(address)).toBe("opens_on_a_branch");
  });
});

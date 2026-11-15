import { describe, expect, it } from "vitest";
import { programLocator } from "../../compiler/utils/programLocator";
import { testCompiler } from "../engineUnderTest";

const URI = "inmemory:///main.sd";

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
    ["the header of a scene that opens on an empty branch", 10],
    ["the header of that empty branch", 11],
    ["the end of that empty branch", 12],
  ] as const)("stays in its own scene at %s", (_name, line) => {
    const locator = programLocator(compile(SCRIPT));
    const address = locator.addressAt(URI, line, { beat: "last" });
    expect(locator.sceneAt(address)).toBe("opens_on_a_branch");
  });
});

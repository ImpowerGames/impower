import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";

const render = (source: string): string => {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  ctx.story.collapseWhitespace = false;
  return runToEnd(ctx.story);
};

describe("whitespace around `{...}` interpolation in display bodies", () => {
  test("a space after an interpolation survives in dialogue", () => {
    expect(
      render(`const LIMIT = 5

scene start
  ALICE:
    The limit is {LIMIT} tonight.
end
`),
    ).toBe("The limit is 5 tonight.\n");
  });

  test("a space after an interpolation survives in an action block", () => {
    expect(
      render(`const LIMIT = 5

scene start
  $:
    The limit is {LIMIT} tonight.
end
`),
    ).toBe("The limit is 5 tonight.\n");
  });

  test("an interpolation opening the line keeps the space after it", () => {
    expect(
      render(`const LIMIT = 5

scene start
  ALICE:
    {LIMIT} is the limit.
end
`),
    ).toBe("5 is the limit.\n");
  });

  test("several interpolations on one line each keep their spacing", () => {
    expect(
      render(`const LIMIT = 5

scene start
  ALICE:
    a {LIMIT} b {LIMIT} c
end
`),
    ).toBe("a 5 b 5 c\n");
  });

  test("a run of spaces after an interpolation survives whole", () => {
    expect(
      render(`const LIMIT = 5

scene start
  ALICE:
    The limit is {LIMIT}  tonight.
end
`),
    ).toBe("The limit is 5  tonight.\n");
  });

  test("an expression interpolation keeps the space after it", () => {
    expect(
      render(`const LIMIT = 5

scene start
  ALICE:
    The limit is {LIMIT + 1} tonight.
end
`),
    ).toBe("The limit is 6 tonight.\n");
  });

  test("a string-valued interpolation keeps the space after it", () => {
    expect(
      render(`const N = "Bo"

scene start
  ALICE:
    Hello {N} there.
end
`),
    ).toBe("Hello Bo there.\n");
  });

  test("a segment spanning two lines keeps line one's spacing and strips line two's indent", () => {
    const interpolated = render(`const LIMIT = 5

scene start
  ALICE:
    The limit is {LIMIT} tonight
    and it holds all night.
end
`);
    const literal = render(`scene start
  ALICE:
    The limit is 5 tonight
    and it holds all night.
end
`);
    expect(interpolated).toBe(literal);
    expect(interpolated).toContain("The limit is 5 tonight");
    expect(interpolated).not.toContain("  and it holds");
  });

  test("text after an inline-glued alternator keeps its leading space", () => {
    expect(
      render(`scene start
  ALICE:
    Before .. queue|A|B|C .. After.
end
`),
    ).toBe("Before A After.\n");
  });

  test("an inline asset directive reaches the engine with its spacing intact", () => {
    expect(
      render(`scene start
  ALICE:
    The car ((sfx_vroom)) drove as he ((sfx_screech)) slammed.
end
`),
    ).toBe("The car ((sfx_vroom)) drove as he ((sfx_screech)) slammed.\n");
    expect(
      render(`scene start
  ALICE:
    The car [[img_car]] drove.
end
`),
    ).toBe("The car [[img_car]] drove.\n");
  });

  test("the spacing survives an incremental recompile of the edited line", () => {
    const uri = "inmemory:///main.sd";
    const before = `const LIMIT = 5

scene start
  ALICE:
    The limit is {LIMIT} tonight.
end
`;
    const compiler = testCompiler();
    compiler.configure({
      files: [
        {
          uri,
          type: "script",
          name: "main",
          ext: "sd",
          text: before,
          version: 1,
          languageId: "sparkdown",
        },
      ],
    });
    const cold = compiler.compile({ textDocument: { uri } }).program;
    expect(cold.chunks).toBeTruthy();

    const line = 4;
    const character = "    The limit is {LIMIT} tonight".length;
    compiler.updateDocument({
      textDocument: { uri, version: 2 },
      contentChanges: [
        {
          range: {
            start: { line, character },
            end: { line, character },
          },
          text: "!",
        },
      ],
    });
    const warm = compiler.compile({ textDocument: { uri } }).program;
    expect(warm.chunks).toBeTruthy();

    const story = testStory(warm.chunks);
    story.collapseWhitespace = false;
    expect(runToEnd(story)).toBe("The limit is 5 tonight!.\n");
  });

  test("punctuation directly after an interpolation is unaffected", () => {
    expect(
      render(`const LIMIT = 5

scene start
  ALICE:
    The limit is {LIMIT}, tonight.
end
`),
    ).toBe("The limit is 5, tonight.\n");
  });

  test("a dialogue line with no interpolation is unaffected", () => {
    expect(
      render(`scene start
  ALICE:
    The limit is 5 tonight.
end
`),
    ).toBe("The limit is 5 tonight.\n");
  });

  test("a scene-level line with an interpolation is unaffected", () => {
    expect(
      render(`const LIMIT = 5

scene start
  The limit is {LIMIT} tonight.
end
`),
    ).toBe("The limit is 5 tonight.\n");
  });
});

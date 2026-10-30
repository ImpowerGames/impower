import { describe, expect, it } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";

const URI = "inmemory:///main.sd";

const script = (global: string, call: string, fn: string[], divert = "", declared = false) =>
  [
    ...(declared ? [global] : []),
    "scene start",
    ...(declared ? [] : [`  ${global}`]),
    ...(divert ? [`  ${divert}`] : []),
    "end",
    "",
    "scene A",
    "  First line.",
    "end",
    "",
    "scene B",
    "  local a, b = 1, 2",
    `  Pair {${call}}.`,
    "end",
    "",
    ...fn,
    "",
  ].join("\n");

const COUNT = ["function count(...)", "  return select(\"#\", ...)", "end"];

const file = (text: string) => ({
  uri: URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

function compiler(text: string) {
  const c = testCompiler();
  c.configure({ files: [file(text)] as never });
  return {
    c,
    compile: () =>
      testStory(c.compile({ textDocument: { uri: URI } }).program.chunks),
  };
}

function play(story: any, scene?: string) {
  const errors: string[] = [];
  const text: string[] = [];
  story.onError = (message: string) => errors.push(message);
  if (scene) {
    story.ChoosePathString(scene);
  }
  while (story.canContinue) {
    const line = story.Continue().trim();
    if (line) text.push(line);
  }
  return { text, errors };
}

function afterEditingSceneA(text: string, fromStart = false) {
  const scene = fromStart ? undefined : "B";
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    const incremental = compiler(text);
    incremental.compile();
    const at = text.indexOf("First");
    const before = text.slice(0, at).split("\n");
    const line = before.length - 1;
    const character = before.at(-1)!.length;
    incremental.c.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [
        {
          range: {
            start: { line, character },
            end: { line, character: character + "First".length },
          },
          text: "Second",
        },
      ],
    });
    const edited = text.slice(0, at) + "Second" + text.slice(at + "First".length);
    return {
      incremental: play(incremental.compile(), scene),
      cold: play(compiler(edited).compile(), scene),
    };
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

describe("incremental call resolution", () => {
  it("calls the function when another scene is edited, as a cold compile does", () => {
    const { incremental, cold } = afterEditingSceneA(
      script("count = 0", "count(a, b, 1)", COUNT),
    );
    expect(cold).toEqual({ text: ["Pair 3."], errors: [] });
    expect(incremental).toEqual(cold);
  });

  it("calls a global made by an assignment that no flow is named after", () => {
    const { incremental, cold } = afterEditingSceneA(
      script("pick = function(x, y) return x + y end", "pick(a, b)", [], "-> B"),
      true,
    );
    expect(cold).toEqual({ text: ["Pair 3."], errors: [] });
    expect(incremental).toEqual(cold);
  });

  it("calls a declared global that a function is named after, as a cold compile does", () => {
    const { incremental, cold } = afterEditingSceneA(
      script("store count = 0", "count(a, b, 1)", COUNT, "", true),
    );
    expect(cold.errors).toHaveLength(1);
    expect(incremental).toEqual(cold);
  });
});

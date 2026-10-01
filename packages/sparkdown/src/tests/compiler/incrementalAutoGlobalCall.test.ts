// #1210 — a bare `count = 0` at the top level makes `count` a global only as
// its assignment resolves, after every call the compile generates has found
// its target. A call in a scene whose flow run an incremental compile reuses
// finds its target again after that, and must resolve as a cold compile
// does: to the function `count`, which a global made that way does not
// shadow, while a global declared with `store` does, and a global made that
// way that no flow is named after is the call's target.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

// With `start`, the top level diverts to scene B, so that a run from the
// start assigns the global before the call.
const script = (global: string, call: string, fn: string[], start = "") =>
  [
    global,
    start,
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

/** A compiler and the story its latest compile handed to `didCompile`. */
function compiler(text: string) {
  const c = new SparkdownCompiler();
  const compiled: { story?: any } = {};
  c.addEventListener("compiler/didCompile", (params) => {
    compiled.story = params.story;
  });
  c.configure({ files: [file(text)] as never });
  return {
    c,
    compile: () => {
      c.compile({ textDocument: { uri: URI } });
      return compiled.story;
    },
  };
}

/** What running scene `scene`, or the story from its start, shows: its text
 *  and the errors it raised. */
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

/** Scene B, or with `fromStart` the story from its start, run on the story of
 *  a compile that followed an edit of scene A, and on a cold compile's story
 *  of the edited text. */
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
      script("store count = 0", "count(a, b, 1)", COUNT),
    );
    expect(cold.errors).toHaveLength(1);
    expect(incremental).toEqual(cold);
  });
});

// Whether a `const` is the story's published constant or a function's Luau
// local is decided while it is lowered, from the functions around it (#1319).
// An edit that changes that answer, or changes a const in one function, has
// to leave the incremental compile reading as a cold compile of the same text.
import { describe, expect, it } from "vitest";
import { File } from "../../compiler/types/File";
import { testCompiler, testStory } from "../engineUnderTest";

const MAIN_URI = "file://proj/main.sd";

const file = (text: string, version: number): File => ({
  uri: MAIN_URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version,
  languageId: "sparkdown",
});

function quiet<T>(fn: () => T): T {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

function position(text: string, offset: number) {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
}

function coldCompile(text: string) {
  return quiet(() => {
    const compiler = testCompiler();
    compiler.configure({ files: [file(text, 1)] });
    return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
  });
}

// Compiles `base`, replaces `find` with `replace` through `updateDocument`,
// and compiles again.
function incrementalAfterEdit(base: string, find: string, replace: string) {
  const from = base.indexOf(find);
  if (from < 0) throw new Error(`${find} is not in the script`);
  return quiet(() => {
    const compiler = testCompiler();
    compiler.configure({ files: [file(base, 1)] });
    compiler.compile({ textDocument: { uri: MAIN_URI } });
    compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [
        {
          range: { start: position(base, from), end: position(base, from + find.length) },
          text: replace,
        },
      ],
    });
    return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
  });
}

function reading(program: any) {
  const errors = Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d: any) => d.severity === 1)
    .map((d: any) => (typeof d.message === "string" ? d.message : d.message?.value ?? ""))
    .sort();
  if (!program.chunks || errors.length > 0) return { errors, output: undefined };
  const story = testStory(program.chunks);
  return { errors, output: quiet(() => story.ContinueMaximally()) };
}

describe("an edit to a const inside a function reads as a cold compile", () => {
  it.each([
    [
      "a local becomes a const with several names",
      "Go {f()}.\nfunction f()\n  local a = 2\n  return a\nend\n",
      "local a = 2",
      "const a, b = 2, 3",
      "Go 2.\n",
    ],
    [
      "one function's const changes, the other's stays",
      "Go {a()} {b()}.\nfunction a()\n  const X = 1\n  return X\nend\nfunction b()\n  const X = 2\n  return X\nend\n",
      "const X = 1",
      "const X = 5",
      "Go 5 2.\n",
    ],
    [
      "a story const and a function const of one name",
      "const X = 1\nGo {f()} {X}.\nfunction f()\n  local y = 0\n  return y\nend\n",
      "local y = 0",
      "const X = 7\n  local y = X",
      "Go 7 1.\n",
    ],
    [
      "a const moves from the story into a function",
      "const X = 3\nGo {f()}.\nfunction f()\n  return 4\nend\n",
      "const X = 3\nGo {f()}.\nfunction f()\n  return 4",
      "Go {f()}.\nfunction f()\n  const X, Y = 3, 4\n  return X + Y",
      "Go 7.\n",
    ],
    [
      "a function around a const is removed",
      "Go {X}.\nfunction f()\n  const X = 3\nend\n",
      "function f()\n  const X = 3\nend",
      "const X = 3",
      "Go 3.\n",
    ],
  ])("%s", (_label, base, find, replace, expected) => {
    const edited = base.replace(find, replace);
    const cold = reading(coldCompile(edited));
    const incremental = reading(incrementalAfterEdit(base, find, replace));
    expect(cold.errors).toEqual([]);
    expect(cold.output).toBe(expected);
    expect(incremental).toEqual(cold);
  });
});

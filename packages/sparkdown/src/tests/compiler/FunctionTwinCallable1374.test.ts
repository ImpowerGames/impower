import "../../inkjs/engine/Container";
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";

// A named top-level function stays reachable from a closure, whether its
// declaration is ordinary Luau or a complete marked physical line.
test.each([
  ["canonical helper and caller", "", ""],
  ["bounded helper and caller", "& ", "& "],
  ["bounded helper, canonical caller", "& ", ""],
  ["canonical helper, bounded caller", "", "& "],
])("a closure calls a top-level function: %s", (_label, helperPrefix, callerPrefix) => {
  const text = [
    `${helperPrefix}function helper() return 5 end`,
    `${callerPrefix}function outer() local callback = function() return helper() end return callback() end`,
    "First {outer()}.", "",
  ].join("\n");
  const uri = "inmemory:///function-twin-callable.sd";
  const compiler = testCompiler();
  compiler.configure({ files: [{ uri, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
  const { program } = compiler.compile({ textDocument: { uri } });
  const diagnostics = Object.values(program.diagnostics ?? {}).flat();
  expect(diagnostics.filter(d => d.severity === 1)).toEqual([]);
  const story = testStory(program.compiled as Record<string, any>);
  const errors: string[] = [];
  story.onError = message => errors.push(message);
  const played = story.ContinueMaximally().trim();
  // Report runtime errors with the played text even when the text fails.
  expect({ played, errors }).toEqual({ played: "First 5.", errors: [] });
});

// Each helper below belongs to a lexical scope. Treating every named function
// under a marked statement as a global would bypass its captured local cell.
test.each(["", "& "])("a nested named helper stays captured with prefix %j", prefix => {
  expectRuntime([
    `${prefix}function outer() local function helper() return 5 end local callback = function() return helper() end return callback() end`,
    "First {outer()}.", "",
  ].join("\n"), "First 5.");
});

test.each(["", "& "])("a conditional helper stays captured with prefix %j", prefix => {
  expectRuntime([
    `${prefix}function outer() if true then local function helper() return 5 end local callback = function() return helper() end return callback() end return 0 end`,
    "First {outer()}.", "",
  ].join("\n"), "First 5.");
});

test.each(["", "& "])("an anonymous initializer does not promote its nested helper with prefix %j", prefix => {
  expectRuntime([
    `${prefix}store value = (function() local function helper() return 5 end local callback = function() return helper() end return callback() end)()`,
    "First {value}.", "",
  ].join("\n"), "First 5.");
});

test.each(["", "& "])("two direct helpers remain callable with prefix %j", prefix => {
  // After a canonical function ends, a separator belongs to story prose.
  // The marked wrapper owns its whole line, including both declarations.
  const helpers = prefix ? [
    `${prefix}function first() return 2 end; function second() return 3 end`,
  ] : ["function first() return 2 end", "function second() return 3 end"];
  expectRuntime([
    ...helpers,
    "function outer() local callback = function() return first() + second() end return callback() end",
    "First {outer()}.", "",
  ].join("\n"), "First 5.");
});

const URI = "inmemory:///function-twin-callable-incremental.sd";

function configured(text: string) {
  const compiler = testCompiler();
  compiler.configure({ files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
  return compiler;
}

function compile(compiler: ReturnType<typeof testCompiler>) {
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

function play(program: ReturnType<typeof compile>) {
  const story = testStory(program.compiled as Record<string, any>);
  const errors: string[] = [];
  story.onError = message => errors.push(message);
  return { played: story.ContinueMaximally().trim(), errors };
}

function expectRuntime(text: string, played: string) {
  const program = compile(configured(text));
  expect(Object.values(program.diagnostics ?? {}).flat().filter(d => d.severity === 1)).toEqual([]);
  expect(play(program)).toEqual({ played, errors: [] });
}

function position(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines.at(-1)!.length };
}

test.each(["", "& "])("a carried closure follows helper addition, removal and undo with prefix %j", prefix => {
  const slot = "-- helper slot";
  const helper = `${prefix}function helper() return 5 end`;
  const padding = Array.from({ length: 60 }, (_, i) => [
    `scene padding_${i}`, `  Padding ${i}.`, "end", "",
  ]).flat();
  let text = [
    "-> result", "", slot, "", ...padding,
    "& function outer() local callback = function() return helper() end return callback() end",
    "", "scene result", "  First {outer()}.", "end", "",
  ].join("\n");
  const compiler = configured(text);
  compile(compiler);
  const from = text.indexOf(slot);
  for (const [step, [removed, inserted]] of [
    [slot, helper], [helper, slot], [slot, helper],
  ].entries()) {
    expect(text.slice(from, from + removed!.length)).toBe(removed);
    compiler.updateDocument({
      textDocument: { uri: URI, version: step + 2 },
      contentChanges: [{ range: {
        start: position(text, from), end: position(text, from + removed!.length),
      }, text: inserted! }],
    });
    text = text.slice(0, from) + inserted + text.slice(from + removed!.length);
    const span = compiler.documents.tree(URI)!.prop(cachedCompilerProp);
    expect(span?.reparsedTo, "the closure must be carried beyond a finite parse window").toBeTypeOf("number");
    expect(span!.reparsedTo!).toBeLessThan(text.indexOf("& function outer"));
    const warm = compile(compiler);
    const cold = compile(configured(text));
    expect(warm.diagnostics).toEqual(cold.diagnostics);
    const warmRun = play(warm);
    expect(warmRun).toEqual(play(cold));
    if (step === 1) {
      expect(warmRun.played).toBe("First");
      expect(warmRun.errors).toHaveLength(1);
      expect(warmRun.errors[0]).toContain("(helper)");
    } else {
      expect(warmRun).toEqual({ played: "First 5.", errors: [] });
    }
  }
});

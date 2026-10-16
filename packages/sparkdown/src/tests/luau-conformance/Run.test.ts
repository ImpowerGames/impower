// End-to-end tests for the `run "path"` statement. Tests both the
// happy path (load + execute a .luau file via run) and the failure
// modes (missing file, cycle detection).

import { describe, expect, test } from "vitest";
import {
  testCompiler,
  testStory,
  withTestExternals,
} from "../engineUnderTest";
import {
  runCallUri,
  runWrapperName,
  runWrapperUri,
} from "../../compiler/utils/runWrapper";

function compileWithFiles(files: Array<{ uri: string; text: string }>) {
  const compiler = testCompiler();
  compiler.configure({
    files: files.map((f) => ({
      uri: f.uri,
      type: "script",
      name: f.uri.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "main",
      ext: f.uri.endsWith(".luau") ? "luau" : "sd",
      text: f.text,
      version: 1,
      languageId: "sparkdown",
    })),
  });
  const result = compiler.compile({
    textDocument: { uri: files[0]!.uri },
  });
  return { compiler, result, ...messagesOf(result) };
}

function messagesOf(
  result: ReturnType<ReturnType<typeof testCompiler>["compile"]>,
) {
  const errs: string[] = [];
  const warns: string[] = [];
  for (const docDiagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiagnostics) {
      const raw = (d as any).message;
      const m = typeof raw === "string" ? raw : raw?.value ?? JSON.stringify(d);
      const sev = (d as any).severity;
      if (sev === 1) errs.push(m);
      else if (sev === 2) warns.push(m);
    }
  }
  return { errs, warns };
}

describe("run statement", () => {
  test.each([
    'run "helpers"',
    'run "helpers.luau"  # tag',
    "run 'helpers'\t",
    "run helpers",
  ])("loads a .luau file and runs its body: %s", (runLine) => {
    // The .luau file's body becomes a wrapper function called from
    // main flow. Inside the function body, bare calls don't fire
    // (#75) so the .luau content uses `&` discard-prefix to invoke
    // the harness-bound external.
    const luau = `& harness_record(42)
`;
    const main = `external harness_record(v)
${runLine}
done
`;
    const { result, errs } = compileWithFiles([
      { uri: "inmemory:///main.sd", text: main },
      { uri: "inmemory:///helpers.luau", text: luau },
    ]);
    expect(errs).toEqual([]);
    expect(result.program.chunks).toBeTruthy();

    const story = testStory(result.program.chunks);
    const recorded: unknown[] = [];
    story.BindExternalFunction("harness_record", (v: unknown) => {
      recorded.push(v);
      return v;
    });
    story.ContinueMaximally();
    expect(recorded).toEqual([42]);
  });

  test("errors on missing .luau file", () => {
    const { errs } = compileWithFiles([
      { uri: "inmemory:///main.sd", text: `run "doesnotexist"\ndone\n` },
    ]);
    expect(errs.some((m) => m.includes("doesnotexist"))).toBe(true);
  });

  // #887: a file run from two places declares its wrapper function once and
  // calls it from each place.
  function recordedRun(chunks: unknown) {
    const story = testStory(chunks as any);
    const recorded: unknown[] = [];
    story.BindExternalFunction("harness_record", (v: unknown) => {
      recorded.push(v);
      return v;
    });
    story.ContinueMaximally();
    return recorded;
  }

  test.each([
    {
      shape: "two run lines in one script",
      helper: "inmemory:///helper.luau",
      files: [
        {
          uri: "inmemory:///main.sd",
          text: `external harness_record(v)\nrun "helper"\nrun "helper"\ndone\n`,
        },
      ],
    },
    {
      shape: "one run line in each of two scripts",
      helper: "inmemory:///helper.luau",
      files: [
        {
          uri: "inmemory:///main.sd",
          text: `external harness_record(v)\ninclude chapter.sd\nrun "helper"\ndone\n`,
        },
        { uri: "inmemory:///chapter.sd", text: `run "helper"\n` },
      ],
    },
    {
      shape: "two paths to it in one script",
      helper: "inmemory:///helper.luau",
      files: [
        {
          uri: "inmemory:///main.sd",
          text: `external harness_record(v)\nrun "helper"\nrun "./helper"\ndone\n`,
        },
      ],
    },
    ...[
      `include lib/chapter.sd\nrun "lib/helper"\n`,
      `run "lib/helper"\ninclude lib/chapter.sd\n`,
    ].map((lines, i) => ({
      shape: `two directories, ${i === 0 ? "the included script" : "the entry script"} first`,
      helper: "inmemory:///lib/helper.luau",
      files: [
        {
          uri: "inmemory:///main.sd",
          text: `external harness_record(v)\n${lines}done\n`,
        },
        { uri: "inmemory:///lib/chapter.sd", text: `run "helper"\n` },
      ],
    })),
  ])("runs one file from $shape, once per run line", ({ helper, files }) => {
    const { result, errs } = compileWithFiles([
      ...files,
      { uri: helper, text: `& harness_record(42)\n` },
    ]);
    expect(errs).toEqual([]);
    expect(recordedRun(result.program.chunks)).toEqual([42, 42]);
  });

  // Two files whose paths, as written, give one wrapper name each get a
  // wrapper of their own.
  test.each([
    { order: "the included script first", lines: `include lib/chapter.sd\nrun "helper"\n`, recorded: [2, 1] },
    { order: "the entry script first", lines: `run "helper"\ninclude lib/chapter.sd\n`, recorded: [1, 2] },
  ])("runs two files run by one path from two directories, $order", ({ lines, recorded }) => {
    const { result, errs } = compileWithFiles([
      {
        uri: "inmemory:///main.sd",
        text: `external harness_record(v)\n${lines}run "helper"\ndone\n`,
      },
      { uri: "inmemory:///lib/chapter.sd", text: `run "helper"\n` },
      { uri: "inmemory:///helper.luau", text: `& harness_record(1)\n` },
      { uri: "inmemory:///lib/helper.luau", text: `& harness_record(2)\n` },
    ]);
    expect(errs).toEqual([]);
    expect(recordedRun(result.program.chunks)).toEqual([...recorded, 1]);
  });

  test("runs two files run by one path when an edit swaps which is reached first", () => {
    const mainWith = (lines: string) =>
      `external harness_record(v)\n${lines}run "helper"\ndone\n`;
    const { compiler, result: first } = compileWithFiles([
      {
        uri: "inmemory:///main.sd",
        text: mainWith(`include lib/chapter.sd\nrun "helper"\n`),
      },
      { uri: "inmemory:///lib/chapter.sd", text: `run "helper"\n` },
      { uri: "inmemory:///helper.luau", text: `& harness_record(1)\n` },
      { uri: "inmemory:///lib/helper.luau", text: `& harness_record(2)\n` },
    ]);
    expect(recordedRun(first.program.chunks)).toEqual([2, 1, 1]);
    let version = 1;
    for (const [lines, recorded] of [
      [`run "helper"\ninclude lib/chapter.sd\n`, [1, 2, 1]],
      [`include lib/chapter.sd\nrun "helper"\n`, [2, 1, 1]],
    ] as const) {
      compiler.updateDocument({
        textDocument: { uri: "inmemory:///main.sd", version: ++version },
        contentChanges: [{ text: withTestExternals(mainWith(lines)) }],
      });
      const result = compiler.compile({
        textDocument: { uri: "inmemory:///main.sd" },
      });
      expect(messagesOf(result).errs).toEqual([]);
      expect(recordedRun(result.program.chunks)).toEqual(recorded);
    }
  });

  test("names the wrapper of a run's call document as of its wrapper document", () => {
    const file = "inmemory:///helper.luau";
    expect(runWrapperName(runWrapperUri(file, "__run_helper"))).toBe(
      "__run_helper",
    );
    expect(runWrapperName(runCallUri(file, "__run_helper", 2))).toBe(
      "__run_helper",
    );
    expect(runWrapperName(file)).toBeUndefined();
  });

  test("runs one file once per run line across incremental compiles", () => {
    const mainWith = (runLines: number) =>
      `external harness_record(v)\n${'run "helper"\n'.repeat(runLines)}done\n`;
    const { compiler, result: first } = compileWithFiles([
      { uri: "inmemory:///main.sd", text: mainWith(2) },
      { uri: "inmemory:///helper.luau", text: `& harness_record(42)\n` },
    ]);
    expect(recordedRun(first.program.chunks)).toEqual([42, 42]);

    let version = 1;
    const recompile = (uri: string, text: string) => {
      compiler.updateDocument({
        textDocument: { uri, version: ++version },
        contentChanges: [{ text: withTestExternals(text) }],
      });
      const result = compiler.compile({
        textDocument: { uri: "inmemory:///main.sd" },
      });
      expect(messagesOf(result).errs).toEqual([]);
      return recordedRun(result.program.chunks);
    };
    expect(recompile("inmemory:///main.sd", mainWith(3))).toEqual([42, 42, 42]);
    expect(recompile("inmemory:///main.sd", mainWith(1))).toEqual([42]);
    expect(recompile("inmemory:///main.sd", mainWith(2))).toEqual([42, 42]);
    // The body an edit to the file gives is #316's: the wrapper document
    // keeps its first text. Each run line still calls it.
    expect(
      recompile("inmemory:///helper.luau", `& harness_record(7)\n`),
    ).toHaveLength(2);
  });

  // Cycle detection guards against a future scenario where `run`
  // might be reachable from inside a wrapped function body. Today
  // the grammar's `^`-anchored `Run` rule only matches at file top
  // level, so a `run` inside `function ... end` never parses as a
  // Run statement — meaning today's wrap design makes `run`-cycles
  // structurally impossible to trigger. The runStack is defensive
  // code we keep for when that constraint loosens (e.g. if `run`
  // is later allowed inside scenes/branches, which DO get spliced
  // inline rather than wrapped).
});

// End-to-end tests for the `run "path"` statement. Tests both the
// happy path (load + execute a .luau file via run) and the failure
// modes (missing file, cycle detection).

import { describe, expect, test } from "vitest";
import {
  testCompiler,
  testStory,
  withTestExternals,
} from "../engineUnderTest";

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
    // main flow, so the call is written as Luau writes it, with no
    // `&` marker (#1374).
    const luau = `harness_record(42)
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

  // #316: a run that names no file is an error, not a statement that runs
  // nothing.
  test.each(["run", 'run ""', "run ''", 'run ".luau"', "run  # tag"])(
    "errors on a run with no path: %s",
    (runLine) => {
      const { errs } = compileWithFiles([
        { uri: "inmemory:///main.sd", text: `${runLine}\ndone\n` },
      ]);
      expect(errs).toEqual(["Expected a file path after 'run'."]);
    },
  );

  // #887: a file run from two places declares its wrapper function once and
  // calls it from each place.
  function recordedRun(chunks: unknown) {
    const story = testStory(chunks as any);
    // A story that loops fails the test instead of hanging it.
    story.stepLimit = 20000;
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
      { uri: helper, text: `harness_record(42)\n` },
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
      { uri: "inmemory:///helper.luau", text: `harness_record(1)\n` },
      { uri: "inmemory:///lib/helper.luau", text: `harness_record(2)\n` },
    ]);
    expect(errs).toEqual([]);
    expect(recordedRun(result.program.chunks)).toEqual([...recorded, 1]);
  });

  // Two files whose URIs a 32-bit hash would give one value (round 3 of PR
  // #1928's review) each keep a wrapper of their own.
  test("runs two files whose URIs share a 32-bit hash", () => {
    const { result, errs } = compileWithFiles([
      {
        uri: "inmemory:///main.sd",
        text: `external harness_record(v)\nrun "d68kpfa1p5a91s/helper"\nrun "dux1d8u1w62cf0/helper"\ndone\n`,
      },
      {
        uri: "inmemory:///d68kpfa1p5a91s/helper.luau",
        text: `harness_record(1)\n`,
      },
      {
        uri: "inmemory:///dux1d8u1w62cf0/helper.luau",
        text: `harness_record(2)\n`,
      },
    ]);
    expect(errs).toEqual([]);
    expect(recordedRun(result.program.chunks)).toEqual([1, 2]);
  });

  // Every reordering of a script that runs three files from three
  // directories, by several paths each, compiles incrementally to what a
  // cold compile of the same text gives (round 2 of PR #1928's review).
  test("runs files from several directories alike, cold and after each reordering", () => {
    const sections = [
      `run "helper"\nrun "./helper"\n`,
      `include a/chapter.sd\n`,
      `include b/chapter.sd\n`,
      `run "a/helper"\n`,
    ];
    const files = [
      {
        uri: "inmemory:///a/chapter.sd",
        text: `run "helper"\nrun "../helper"\nrun "./helper"\n`,
      },
      {
        uri: "inmemory:///b/chapter.sd",
        text: `run "helper"\nrun "../a/helper"\nrun "../helper"\nrun "./helper"\n`,
      },
      ...["helper", "a/helper", "b/helper"].map((name, i) => ({
        uri: `inmemory:///${name}.luau`,
        text: `harness_record(${i})\n`,
      })),
    ];
    const mainWith = (order: number[]) =>
      `external harness_record(v)\n${order.map((i) => sections[i]).join("")}done\n`;
    const orders = (rest: number[]): number[][] =>
      rest.length === 0
        ? [[]]
        : rest.flatMap((i) =>
            orders(rest.filter((j) => j !== i)).map((o) => [i, ...o]),
          );
    const all = orders([0, 1, 2, 3]);
    const cold = (order: number[]) => {
      const { result, errs } = compileWithFiles([
        { uri: "inmemory:///main.sd", text: mainWith(order) },
        ...files,
      ]);
      expect(errs).toEqual([]);
      return recordedRun(result.program.chunks);
    };
    const { compiler } = compileWithFiles([
      { uri: "inmemory:///main.sd", text: mainWith(all[0]!) },
      ...files,
    ]);
    let version = 1;
    for (const order of [...all, all[0]!]) {
      compiler.updateDocument({
        textDocument: { uri: "inmemory:///main.sd", version: ++version },
        contentChanges: [{ text: withTestExternals(mainWith(order)) }],
      });
      const result = compiler.compile({
        textDocument: { uri: "inmemory:///main.sd" },
      });
      expect(messagesOf(result).errs).toEqual([]);
      expect(recordedRun(result.program.chunks), order.join(",")).toEqual(
        cold(order),
      );
    }
  });

  // The wrapper's name is the file's alone: an edit elsewhere neither
  // changes what `debug.info` reports for it nor makes it collide with an
  // author's function (round 3 of PR #1928's review).
  test("names the wrapper alike cold and after an edit above a run line", () => {
    const text = `external harness_record(v)\nrun "helper"\nrun "helper"\ndone\nfunction __run_helper_2()\n  return 9\nend\nfunction __run_helper_3()\n  return 9\nend\n`;
    const helper = {
      uri: "inmemory:///helper.luau",
      text: `harness_record(debug.info(1, "n"))\n`,
    };
    const { compiler, result: first } = compileWithFiles([
      { uri: "inmemory:///main.sd", text },
      helper,
    ]);
    const before = recordedRun(first.program.chunks);
    expect(before).toHaveLength(2);
    expect(before[0]).toMatch(/^__run_\w+helper\w*__$/);
    expect(before[1]).toBe(before[0]);
    compiler.updateDocument({
      textDocument: { uri: "inmemory:///main.sd", version: 2 },
      contentChanges: [
        {
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 0 },
          },
          text: "; insert above\n",
        },
      ],
    });
    const warm = compiler.compile({
      textDocument: { uri: "inmemory:///main.sd" },
    });
    const cold = compileWithFiles([
      { uri: "inmemory:///main.sd", text: text.replace("run", "; insert above\nrun") },
      helper,
    ]);
    expect(messagesOf(warm).errs).toEqual([]);
    expect(cold.errs).toEqual([]);
    expect(recordedRun(warm.program.chunks)).toEqual(before);
    expect(recordedRun(cold.result.program.chunks)).toEqual(before);
  });

  test("runs one file once per run line across incremental compiles", () => {
    const mainWith = (runLines: number) =>
      `external harness_record(v)\n${'run "helper"\n'.repeat(runLines)}done\n`;
    const { compiler, result: first } = compileWithFiles([
      { uri: "inmemory:///main.sd", text: mainWith(2) },
      { uri: "inmemory:///helper.luau", text: `harness_record(42)\n` },
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
    // An edit to the file gives each run line its new body (#316).
    expect(
      recompile("inmemory:///helper.luau", `harness_record(7)\n`),
    ).toEqual([7, 7]);
  });

  // #316: the wrapper document is set again when the file changes, so a
  // compile after `updateFile` runs the file's new body, and one after
  // that, with the file unchanged, runs it too.
  test("runs a file's new body after the file is updated", () => {
    const helper = (text: string, version: number) => ({
      uri: "inmemory:///helper.luau",
      type: "script",
      name: "helper",
      ext: "luau",
      text,
      version,
      languageId: "sparkdown",
    });
    const { compiler, result: first } = compileWithFiles([
      {
        uri: "inmemory:///main.sd",
        text: `external harness_record(v)\nrun "helper"\ndone\n`,
      },
      { uri: "inmemory:///helper.luau", text: `harness_record(1)\n` },
    ]);
    expect(recordedRun(first.program.chunks)).toEqual([1]);
    compiler.updateFile({ file: helper(`harness_record(2)\n`, 2) as never });
    for (const _ of [0, 1]) {
      const result = compiler.compile({
        textDocument: { uri: "inmemory:///main.sd" },
      });
      expect(messagesOf(result).errs).toEqual([]);
      expect(recordedRun(result.program.chunks)).toEqual([2]);
    }
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

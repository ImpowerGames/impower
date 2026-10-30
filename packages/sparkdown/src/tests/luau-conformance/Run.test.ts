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
    const luau = `harness_record(42)
`;
    const main = `external harness_record(v)

scene start
  ${runLine}
  done
end
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
      { uri: "inmemory:///main.sd", text: `run "doesnotexist"\nscene start\n  done\nend\n` },
    ]);
    expect(errs.some((m) => m.includes("doesnotexist"))).toBe(true);
  });

  test.each(["run", 'run ""', "run ''", 'run ".luau"', "run  # tag"])(
    "errors on a run with no path: %s",
    (runLine) => {
      const { errs } = compileWithFiles([
        { uri: "inmemory:///main.sd", text: `${runLine}\nscene start\n  done\nend\n` },
      ]);
      expect(errs).toEqual(["Expected a file path after 'run'."]);
    },
  );

  function recordedRun(chunks: unknown) {
    const story = testStory(chunks as any);
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
          text: `external harness_record(v)\nscene start\n  run "helper"\n  run "helper"\n  done\nend\n`,
        },
      ],
    },
    {
      shape: "two paths to it in one script",
      helper: "inmemory:///helper.luau",
      files: [
        {
          uri: "inmemory:///main.sd",
          text: `external harness_record(v)\nscene start\n  run "helper"\n  run "./helper"\n  done\nend\n`,
        },
      ],
    },
    {
      shape: "a directory, by two paths",
      helper: "inmemory:///lib/helper.luau",
      files: [
        {
          uri: "inmemory:///main.sd",
          text: `external harness_record(v)\nscene start\n  run "lib/helper"\n  run "./lib/helper"\n  done\nend\n`,
        },
      ],
    },
  ])("runs one file from $shape, once per run line", ({ helper, files }) => {
    const { result, errs } = compileWithFiles([
      ...files,
      { uri: helper, text: `harness_record(42)\n` },
    ]);
    expect(errs).toEqual([]);
    expect(recordedRun(result.program.chunks)).toEqual([42, 42]);
  });

  test("runs where its line stands, in the start scene and each time a scene that holds it plays", () => {
    const { result, errs } = compileWithFiles([
      {
        uri: "inmemory:///main.sd",
        text: [
          "external harness_record(v)",
          "",
          "scene start",
          '  & harness_record("before")',
          '  run "helper"',
          '  & harness_record("after")',
          "  -> s ->",
          "  -> s ->",
          '  & harness_record("done")',
          "  done",
          "end",
          "",
          "scene s",
          '  & harness_record("in s")',
          '  run "helper"',
          "  ->->",
          "end",
          "",
        ].join("\n"),
      },
      { uri: "inmemory:///helper.luau", text: `harness_record("helper")\n` },
    ]);
    expect(errs).toEqual([]);
    expect(recordedRun(result.program.chunks)).toEqual([
      "before",
      "helper",
      "after",
      "in s",
      "helper",
      "in s",
      "helper",
      "done",
    ]);
  });

  test("runs a run line in a scene of a script other than main", () => {
    const { result, errs } = compileWithFiles([
      { uri: "inmemory:///main.sd", text: "external harness_record(v)\nscene start\n  -> s\nend\n" },
      {
        uri: "inmemory:///chapters/chapter.sd",
        text: 'scene s\n  run "../helpers"\n  done\nend\n',
      },
      { uri: "inmemory:///helpers.luau", text: "harness_record(7)\n" },
    ]);
    expect(errs).toEqual([]);
    expect(recordedRun(result.program.chunks)).toEqual([7]);
  });

  test("runs a run line at the top level of a script with the declarations", () => {
    const { result, errs } = compileWithFiles([
      {
        uri: "inmemory:///main.sd",
        text: `store count = 0\nrun "helper"\n\nscene start\n  Count {count}.\nend\n`,
      },
      { uri: "inmemory:///helper.luau", text: `count = count + 1\n` },
    ]);
    expect(errs).toEqual([]);
    expect(testStory(result.program.chunks).ContinueMaximally()).toBe("Count 1.\n");
  });

  test("runs a run line at the top level of a script other than main with the declarations", () => {
    const { result, errs } = compileWithFiles([
      {
        uri: "inmemory:///main.sd",
        text: `store count = 0\nrun "helper"\n\nscene start\n  Count {count}.\nend\n`,
      },
      { uri: "inmemory:///lib/chapter.sd", text: `run "helper"\n` },
      { uri: "inmemory:///helper.luau", text: `count = count + 1\n` },
      { uri: "inmemory:///lib/helper.luau", text: `count = count + 10\n` },
    ]);
    expect(errs).toEqual([]);
    expect(testStory(result.program.chunks).ContinueMaximally()).toBe("Count 11.\n");
  });

  test("runs two files whose URIs share a 32-bit hash", () => {
    const { result, errs } = compileWithFiles([
      {
        uri: "inmemory:///main.sd",
        text: `external harness_record(v)\nscene start\n  run "d68kpfa1p5a91s/helper"\n  run "dux1d8u1w62cf0/helper"\n  done\nend\n`,
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

  test("runs files from several directories alike, cold and after each reordering", () => {
    const sections = [
      `  run "helper"\n  run "./helper"\n`,
      `  run "a/helper"\n  run "./a/helper"\n`,
      `  run "b/helper"\n  run "./b/helper"\n  run "a/helper"\n`,
      `  run "a/helper"\n`,
    ];
    const files = [
      ...["helper", "a/helper", "b/helper"].map((name, i) => ({
        uri: `inmemory:///${name}.luau`,
        text: `harness_record(${i})\n`,
      })),
    ];
    const mainWith = (order: number[]) =>
      `external harness_record(v)\nscene start\n${order.map((i) => sections[i]).join("")}  done\nend\n`;
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

  test("names the wrapper alike cold and after an edit above a run line", () => {
    const text = `external harness_record(v)\nscene start\n  run "helper"\n  run "helper"\n  done\nend\nfunction __run_helper_2()\n  return 9\nend\nfunction __run_helper_3()\n  return 9\nend\n`;
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
    expect(before[0]).toBe("helper");
    expect(before[1]).toBe(before[0]);
    compiler.updateDocument({
      textDocument: { uri: "inmemory:///main.sd", version: 2 },
      contentChanges: [
        {
          range: {
            start: { line: 2, character: 0 },
            end: { line: 2, character: 0 },
          },
          text: "  // insert above\n",
        },
      ],
    });
    const warm = compiler.compile({
      textDocument: { uri: "inmemory:///main.sd" },
    });
    const cold = compileWithFiles([
      { uri: "inmemory:///main.sd", text: text.replace("  run", "  // insert above\n  run") },
      helper,
    ]);
    expect(messagesOf(warm).errs).toEqual([]);
    expect(cold.errs).toEqual([]);
    expect(recordedRun(warm.program.chunks)).toEqual(before);
    expect(recordedRun(cold.result.program.chunks)).toEqual(before);
  });

  test("runs one file once per run line across incremental compiles", () => {
    const mainWith = (runLines: number) =>
      `external harness_record(v)\nscene start\n${'  run "helper"\n'.repeat(runLines)}  done\nend\n`;
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
    expect(
      recompile("inmemory:///helper.luau", `harness_record(7)\n`),
    ).toEqual([7, 7]);
  });

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
        text: `external harness_record(v)\nscene start\n  run "helper"\n  done\nend\n`,
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
});

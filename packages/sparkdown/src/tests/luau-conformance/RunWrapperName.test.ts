import { describe, expect, test } from "vitest";
import {
  TestProgramStory,
  testCompiler,
  testStory,
  withTestExternals,
} from "../engineUnderTest";

type File = { uri: string; text: string };

function compileWithFiles(files: File[], uriPathsAsWritten = false) {
  const compiler = testCompiler();
  compiler.configure({
    uriPathsAsWritten,
    files: files.map((f) => ({
      uri: f.uri,
      type: "script",
      name:
        decodeURIComponent(f.uri.split("/").pop() ?? "").replace(
          /\.[^.]+$/,
          "",
        ) || "main",
      ext: f.uri.endsWith(".luau") ? "luau" : "sd",
      text: f.text,
      version: 1,
      languageId: "sparkdown",
    })),
  });
  const result = compiler.compile({
    textDocument: { uri: files[0]!.uri },
  });
  const errs: string[] = [];
  for (const diagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const d of diagnostics as any[]) {
      if (d.severity === 1) {
        errs.push(
          typeof d.message === "string" ? d.message : JSON.stringify(d),
        );
      }
    }
  }
  return { compiler, result, errs };
}

function probe(files: File[], uriPathsAsWritten = false) {
  const { result, errs } = compileWithFiles(files, uriPathsAsWritten);
  expect(errs).toEqual([]);
  const story = testStory(result.program.chunks);
  story.stepLimit = 20000;
  const recorded: unknown[] = [];
  const paths: (string | null)[][] = [];
  const frames: string[][] = [];
  const traces: string[] = [];
  story.BindExternalFunction("harness_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  story.BindExternalFunction("harness_probe", () => {
    const count = story.CallFrameCount();
    paths.push(Array.from({ length: count }, (_, i) => story.CallFramePath(i)));
    frames.push((story.debugFrames(0) ?? []).map((frame) => frame.name));
    traces.push(story.CallStackTrace());
    return null;
  });
  story.ContinueMaximally();
  return { recorded, paths, frames, traces };
}

const EXTERNALS = "external harness_record(v)\nexternal harness_probe()\n";

const BODY = `harness_record(debug.info(1, "n"))\nharness_record(debug.traceback())\nharness_probe()\n`;

describe("a run file's wrapper is shown by the file's name (I-1266)", () => {
  test.each([
    { spelling: "a name", line: "run helper" },
    { spelling: "a quoted path", line: 'run "helper.luau"' },
    { spelling: "a quoted path without its extension", line: 'run "helper"' },
  ])("shows helper.luau as helper when run by $spelling", ({ line }) => {
    const { recorded, paths, frames, traces } = probe([
      { uri: "file:///C:/proj/main.sd", text: `${EXTERNALS}${line}\ndone\n` },
      { uri: "file:///C:/proj/helper.luau", text: BODY },
    ]);
    expect(recorded[0]).toBe("helper");
    expect(String(recorded[1])).toContain("helper");
    expect(String(recorded[1])).not.toContain("__run_");
    expect(paths[0]).toContain("helper");
    expect(paths[0]!.join("|")).not.toContain("__run_");
    expect(frames[0]).toContain("helper");
    expect(frames[0]!.join("|")).not.toContain("__run_");
    expect(traces[0]).toContain("<SOMEWHERE IN helper>");
    expect(traces[0]).not.toContain("__run_");
  });

  test("decodes the file's name: my helper.luau shows as my helper", () => {
    const { recorded, paths, frames } = probe([
      {
        uri: "file:///C:/proj/main.sd",
        text: `${EXTERNALS}run "my helper"\ndone\n`,
      },
      { uri: "file:///C:/proj/my%20helper.luau", text: BODY },
    ]);
    expect(recorded[0]).toBe("my helper");
    expect(paths[0]).toContain("my helper");
    expect(frames[0]).toContain("my helper");
  });

  test("tells two run files with one name apart by their paths in the project", () => {
    const { recorded, paths, frames, traces } = probe([
      {
        uri: "file:///C:/proj/main.sd",
        text: `${EXTERNALS}run "a/helper"\nrun "b dir/helper"\ndone\n`,
      },
      { uri: "file:///C:/proj/a/helper.luau", text: BODY },
      { uri: "file:///C:/proj/b%20dir/helper.luau", text: BODY },
    ]);
    expect([recorded[0], recorded[2]]).toEqual(["a/helper", "b dir/helper"]);
    expect(paths.map((path) => path[1])).toEqual(["a/helper", "b dir/helper"]);
    expect(frames.map((names) => names[1])).toEqual([
      "a/helper",
      "b dir/helper",
    ]);
    expect(traces[0]).toContain("<SOMEWHERE IN a/helper>");
    expect(traces[1]).toContain("<SOMEWHERE IN b dir/helper>");
  });

  test("names the files anew when an incremental compile adds or removes a file of one name", () => {
    const mainWith = (lines: string) =>
      `external harness_record(v)\n${lines}done\n`;
    const files = [
      { uri: "file:///C:/proj/main.sd", text: mainWith('run "a/helper"\n') },
      {
        uri: "file:///C:/proj/a/helper.luau",
        text: `harness_record(debug.info(1, "n"))\n`,
      },
      {
        uri: "file:///C:/proj/b/helper.luau",
        text: `harness_record(debug.info(1, "n"))\n`,
      },
    ];
    const { compiler, result } = compileWithFiles(files);
    const run = (chunks: unknown) => {
      const story = testStory(chunks as any);
      story.stepLimit = 20000;
      const recorded: unknown[] = [];
      story.BindExternalFunction("harness_record", (v: unknown) => {
        recorded.push(v);
        return v;
      });
      story.ContinueMaximally();
      return recorded;
    };
    expect(run(result.program.chunks)).toEqual(["helper"]);
    let version = 1;
    const recompile = (text: string) => {
      compiler.updateDocument({
        textDocument: { uri: "file:///C:/proj/main.sd", version: ++version },
        contentChanges: [{ text: withTestExternals(text) }],
      });
      return run(
        compiler.compile({ textDocument: { uri: "file:///C:/proj/main.sd" } })
          .program.chunks,
      );
    };
    expect(recompile(mainWith('run "a/helper"\nrun "b/helper"\n'))).toEqual([
      "a/helper",
      "b/helper",
    ]);
    expect(recompile(mainWith('run "b/helper"\n'))).toEqual(["helper"]);
  });

  test("prints the wrapper's function value by the file's name, before and after a save", () => {
    const wrapper = "__run_file_3a_2f_2f_2fC_3a_2fproj_2fhelper_2eluau__";
    const main = `${EXTERNALS}run hold
First line.
run show
run helper
done
`;
    const { result, errs } = compileWithFiles([
      { uri: "file:///C:/proj/main.sd", text: main },
      { uri: "file:///C:/proj/helper.luau", text: `harness_record(1)\n` },
      {
        uri: "file:///C:/proj/hold.luau",
        text: `held = ${wrapper}\nharness_record(tostring(held))\n`,
      },
      {
        uri: "file:///C:/proj/show.luau",
        text: `harness_record(tostring(held))\n`,
      },
    ]);
    expect(errs).toEqual([]);
    const bind = (story: ReturnType<typeof testStory>, out: unknown[]) => {
      story.stepLimit = 20000;
      story.BindExternalFunction("harness_record", (v: unknown) => {
        out.push(v);
        return v;
      });
      story.BindExternalFunction("harness_probe", () => null);
    };
    const before: unknown[] = [];
    const first = testStory(result.program.chunks);
    bind(first, before);
    first.Continue();
    const saved = first.state.ToJson();
    const after: unknown[] = [];
    const second = testStory(result.program.chunks);
    bind(second, after);
    second.state.LoadJson(saved);
    second.ContinueMaximally();
    expect(before).toEqual(["function: helper"]);
    expect(after).toEqual(["function: helper", 1]);
  });

  test.each([
    {
      shape: "a local function",
      define: "local function inner()",
      call: "inner()",
    },
    { shape: "a global function", define: "function inner()", call: "inner()" },
    {
      shape: "a function literal",
      define: "local inner = function()",
      call: "inner()",
    },
    {
      shape: "a function inside another function",
      define: "local function outer()\n  local function inner()",
      call: "  inner()\nend\nouter()",
    },
  ])(
    "shows $shape the file defines under the file's name",
    ({ define, call }) => {
      const { recorded, paths, frames, traces } = probe([
        {
          uri: "file:///C:/proj/main.sd",
          text: `${EXTERNALS}run "my helper"\ndone\n`,
        },
        {
          uri: "file:///C:/proj/my%20helper.luau",
          text: `${define}\n  harness_record(debug.info(1, "n"))\n  harness_probe()\nend\n${call}\n`,
        },
      ]);
      const shown = [...paths[0]!, ...frames[0]!, traces[0]!].join("|");
      expect(shown).not.toContain("__run_");
      expect(shown).toContain("my helper");
      expect(recorded[0]).not.toContain("__run_");
    },
  );

  test.each([
    {
      shape: "inside an author's function",
      hold: "local function outer()\n  local function WRAPPER()",
      call: "  WRAPPER()\nend\nouter()",
      label: "outer.WRAPPER",
    },
    {
      shape: "at the top level of a run file",
      hold: "local function WRAPPER()",
      call: "WRAPPER()",
      label: "WRAPPER",
    },
  ])(
    "keeps the name of an author's function spelled like the wrapper $shape",
    ({ hold, call, label }) => {
      const wrapper = "__run_file_3a_2f_2f_2fC_3a_2fproj_2fhelper_2eluau__";
      const named = (text: string) => text.split("WRAPPER").join(wrapper);
      const { recorded, paths } = probe([
        {
          uri: "file:///C:/proj/main.sd",
          text: `${EXTERNALS}run helper\nrun shadow\ndone\n`,
        },
        { uri: "file:///C:/proj/helper.luau", text: `harness_record(1)\n` },
        {
          uri: "file:///C:/proj/shadow.luau",
          text: named(
            `${hold}\n  harness_record(debug.info(1, "n"))\n  harness_probe()\nend\n${call}\n`,
          ),
        },
      ]);
      expect(recorded).toEqual([1, wrapper]);
      expect(paths[0]![paths[0]!.length - 2]).toBe(`shadow.${named(label)}`);
    },
  );

  test.each([
    {
      host: "a host that encodes its URIs",
      asWritten: false,
      shown: "my helper",
    },
    {
      host: "a host that writes paths as they are",
      asWritten: true,
      shown: "my%20helper",
    },
  ])(
    "shows my%20helper.luau as the file system names it on $host",
    ({ asWritten, shown }) => {
      const { recorded, paths } = probe(
        [
          {
            uri: "file:///C:/proj/main.sd",
            text: `${EXTERNALS}run "${asWritten ? "my%20helper" : "my helper"}"\ndone\n`,
          },
          { uri: "file:///C:/proj/my%20helper.luau", text: BODY },
        ],
        asWritten,
      );
      expect(recorded[0]).toBe(shown);
      expect(paths[0]).toContain(shown);
    },
  );

  test.each(["an execution image", "the state's JSON"])(
    "prints a carried wrapper value by the running program's name after restoring %s",
    (carrier) => {
      const wrapper = "__run_file_3a_2f_2f_2fC_3a_2fproj_2fa_2fhelper_2eluau__";
      const mainWith = (runs: string) =>
        `${EXTERNALS}run hold\nFirst line.\nrun show\n${runs}done\n`;
      const files = [
        { uri: "file:///C:/proj/main.sd", text: mainWith('run "a/helper"\n') },
        { uri: "file:///C:/proj/hold.luau", text: `held = ${wrapper}\n` },
        {
          uri: "file:///C:/proj/show.luau",
          text: `harness_record(tostring(held))\n`,
        },
        {
          uri: "file:///C:/proj/a/helper.luau",
          text: `harness_record(debug.info(1, "n"))\n`,
        },
        {
          uri: "file:///C:/proj/b/helper.luau",
          text: `harness_record(debug.info(1, "n"))\n`,
        },
      ];
      const { compiler, result, errs } = compileWithFiles(files);
      expect(errs).toEqual([]);
      const bind = (story: ReturnType<typeof testStory>, out: unknown[]) => {
        story.stepLimit = 20000;
        story.BindExternalFunction("harness_record", (v: unknown) => {
          out.push(v);
          return v;
        });
        story.BindExternalFunction("harness_probe", () => null);
      };
      const first = testStory(result.program.chunks);
      bind(first, []);
      first.Continue();
      const image = first.capture();
      const json = first.state.ToJson();
      compiler.updateDocument({
        textDocument: { uri: "file:///C:/proj/main.sd", version: 2 },
        contentChanges: [
          {
            text: withTestExternals(
              mainWith('run "a/helper"\nrun "b/helper"\n'),
            ),
          },
        ],
      });
      const next = compiler.compile({
        textDocument: { uri: "file:///C:/proj/main.sd" },
      });
      const after: unknown[] = [];
      const second = new TestProgramStory(next.program.chunks!, {
        images: first.images,
      });
      bind(second, after);
      if (carrier === "an execution image") {
        expect(second.restore(image)).toBe(true);
      } else {
        second.state.LoadJson(json);
      }
      second.ContinueMaximally();
      expect(after).toEqual(["function: a/helper", "a/helper", "b/helper"]);
    },
  );

  test("shows a file name that holds a dot whole: my.helper.luau shows as my.helper", () => {
    const { recorded, paths } = probe([
      {
        uri: "file:///C:/proj/main.sd",
        text: `${EXTERNALS}run "my.helper.luau"\ndone\n`,
      },
      { uri: "file:///C:/proj/my.helper.luau", text: BODY },
    ]);
    expect(recorded[0]).toBe("my.helper");
    expect(paths[0]).toContain("my.helper");
  });

  test("never renames an author's function named like a wrapper", () => {
    const main = `${EXTERNALS}run helper
& __run_helper__()
& __run__uffffff__()
done
function __run_helper__()
  harness_record(debug.info(1, "n"))
end
function __run__uffffff__()
  harness_record(debug.info(1, "n"))
end
`;
    const { recorded } = probe([
      { uri: "file:///C:/proj/main.sd", text: main },
      {
        uri: "file:///C:/proj/helper.luau",
        text: `harness_record(debug.info(1, "n"))\n`,
      },
    ]);
    expect(recorded).toEqual(["helper", "__run_helper__", "__run__uffffff__"]);
  });

  test("keeps a wrapper and an author function of the shown name apart as table keys", () => {
    const wrapper = "__run_file_3a_2f_2f_2fC_3a_2fproj_2fhelper_2eluau__";
    const keys = `local t = {}
t[__run_helper__] = 1
t[__run_helper] = 2
t[helper] = 3
t[${wrapper}] = 4
local n = 0
for _ in pairs(t) do
  n = n + 1
end
harness_record(n)
harness_record(t[__run_helper__])
harness_record(t[__run_helper])
harness_record(t[helper])
harness_record(t[${wrapper}])
`;
    const main = `${EXTERNALS}run keys
run helper
done
function helper()
  return 0
end
function __run_helper__()
  return 0
end
function __run_helper()
  return 0
end
`;
    const { recorded } = probe([
      { uri: "file:///C:/proj/main.sd", text: main },
      { uri: "file:///C:/proj/keys.luau", text: keys },
      {
        uri: "file:///C:/proj/helper.luau",
        text: `harness_record(debug.info(1, "n"))\n`,
      },
    ]);
    expect(recorded).toEqual([4, 1, 2, 3, 4, "helper"]);
  });
});

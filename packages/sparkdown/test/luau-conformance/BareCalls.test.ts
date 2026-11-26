
import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";

function compileAndRun(source: string) {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const errs: string[] = [];
  for (const docDiagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiagnostics) {
      const raw = (d as any).message;
      const m = typeof raw === "string" ? raw : raw?.value ?? JSON.stringify(d);
      const sev = (d as any).severity;
      if (sev === 1) errs.push(m);
    }
  }
  return { result, errs };
}

describe("bare statement-level calls inside function bodies", () => {
  test("bare call fires the bound external", () => {
    const src = `external host_record(v)

scene start
  & run()
  done
end

function run()
host_record(42)
end
`;
    const { result, errs } = compileAndRun(src);
    expect(errs).toEqual([]);
    const story = testStory(result.program.chunks);
    const recorded: unknown[] = [];
    story.BindExternalFunction("host_record", (v: unknown) => {
      recorded.push(v);
      return v;
    });
    story.ContinueMaximally();
    expect(recorded).toEqual([42]);
  });

  test("prefixed call still works (regression guard)", () => {
    const src = `external host_record(v)

scene start
  & run()
  done
end

function run()
host_record(99)
end
`;
    const { result, errs } = compileAndRun(src);
    expect(errs).toEqual([]);
    const story = testStory(result.program.chunks);
    const recorded: unknown[] = [];
    story.BindExternalFunction("host_record", (v: unknown) => {
      recorded.push(v);
      return v;
    });
    story.ContinueMaximally();
    expect(recorded).toEqual([99]);
  });

  test("bare DOTTED stdlib call fires (table.insert without `&`)", () => {
    const src = `external host_record(v)

scene start
  & run()
  done
end

function run()
local t = { 1, 2, 3 }
table.insert(t, 99)
host_record(table.concat(t, ","))
end
`;
    const { result, errs } = compileAndRun(src);
    expect(errs).toEqual([]);
    const story = testStory(result.program.chunks);
    const recorded: unknown[] = [];
    story.BindExternalFunction("host_record", (v: unknown) => {
      recorded.push(v);
      return v;
    });
    story.ContinueMaximally();
    expect(recorded).toEqual(["1,2,3,99"]);
  });
});

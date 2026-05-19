// Verifies that statement-level function calls work inside function
// bodies WITHOUT the `&` discard-prefix. Per sparkdown's promised
// semantics: outside functions, top-level Luau statements require the
// `&` prefix; inside function bodies, bare calls are valid Luau
// syntax and should fire at runtime.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

function compileAndRun(source: string) {
  const compiler = new SparkdownCompiler();
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

& run()
done

function run()
host_record(42)
end
`;
    const { result, errs } = compileAndRun(src);
    expect(errs).toEqual([]);
    const story = new RuntimeStory(
      result.program.compiled as Record<string, any>,
    );
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

& run()
done

function run()
host_record(99)
end
`;
    const { result, errs } = compileAndRun(src);
    expect(errs).toEqual([]);
    const story = new RuntimeStory(
      result.program.compiled as Record<string, any>,
    );
    const recorded: unknown[] = [];
    story.BindExternalFunction("host_record", (v: unknown) => {
      recorded.push(v);
      return v;
    });
    story.ContinueMaximally();
    expect(recorded).toEqual([99]);
  });
});

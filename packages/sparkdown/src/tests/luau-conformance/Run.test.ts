// End-to-end tests for the `run "path"` statement. Tests both the
// happy path (load + execute a .luau file via run) and the failure
// modes (missing file, cycle detection).

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

function compileWithFiles(files: Array<{ uri: string; text: string }>) {
  const compiler = new SparkdownCompiler();
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
  return { result, errs, warns };
}

describe("run statement", () => {
  test("loads a .luau file and runs its body", () => {
    // The .luau file's body becomes a wrapper function called from
    // main flow. Inside the function body, bare calls don't fire
    // (#75) so the .luau content uses `&` discard-prefix to invoke
    // the harness-bound external.
    const luau = `& harness_record(42)
`;
    const main = `external harness_record(v)
run "helpers"
done
`;
    const { result, errs } = compileWithFiles([
      { uri: "inmemory:///main.sd", text: main },
      { uri: "inmemory:///helpers.luau", text: luau },
    ]);
    expect(errs).toEqual([]);
    expect(result.program.compiled).toBeTruthy();

    const story = new RuntimeStory(
      result.program.compiled as Record<string, any>,
    );
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

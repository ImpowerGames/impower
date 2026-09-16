// Shared helper for the ports of Luau's parser/compiler DIAGNOSTIC tests
// (`luau/tests/Parser.test.cpp`, `luau/tests/Compiler.test.cpp`). Where the
// runtime conformance harness runs well-formed fixtures to completion, these
// only compile and collect what the diagnostics pipeline says about malformed
// source.
//
// Every upstream snippet is a Luau chunk, and sparkdown is a Luau superset
// only inside function bodies (top-level text is narrative), so
// `diagnoseInFunction` wraps the snippet in `function run() ... end` the same
// way the runtime harness does. `diagnose` compiles the source verbatim for
// the few cases that need the top level.

import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

export function diagnose(source: string): string[] {
  const compiler = new SparkdownCompiler();
  const uri = "inmemory:///main.sd";
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri } });
  const out: string[] = [];
  for (const ds of Object.values(result.program.diagnostics ?? {})) {
    for (const d of ds as any[]) {
      out.push(
        typeof d?.message === "string" ? d.message : (d?.message?.value ?? ""),
      );
    }
  }
  return out;
}

export function diagnoseInFunction(body: string): string[] {
  return diagnose(`function run()\n${body}\nend\n`);
}

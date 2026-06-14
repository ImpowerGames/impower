// Same-name different-type defines (e.g. `define raffles as character` +
// `define raffles as synth` — the engine links a character to its voice
// synth BY NAME, so this pairing is required) must still produce a
// RUNNABLE program, not just clean diagnostics.
//
// Regression: the second define loses the flat global-name slot, so its
// `__def(...)` expression is never generated into a runtime container —
// which means its inner `-> __def` divert never gets a `runtimeDivert`.
// Previously its `ResolveReferences` still ran and threw on that missing
// runtimeDivert, ABORTING the whole resolve pass. Anything resolved after
// it (e.g. a later choice's start-content return target) was left with a
// null path, so `JsonSerialisation` crashed on a null `DivertTargetValue`,
// the exception was swallowed, and `program.compiled` was never set — so
// the engine refused to run the game (black preview) even with 0 errors.
//
// Fix: VariableAssignment.isSuppressedDuplicateDefine skips the suppressed
// duplicate's ResolveReferences (its struct still registers type-namespaced
// via the lowerer's `context`). See FlowBase.AddNewVariableDeclaration.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function compile(src: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: src,
        version: 1,
        languageId: "sparkdown",
      } as any,
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  let errors = 0;
  for (const ds of Object.values(result.program.diagnostics ?? {})) {
    for (const d of ds as any[]) if (d?.severity === 1) errors++;
  }
  return {
    compiled: (result.program as any).compiled !== undefined,
    errors,
    program: result.program,
  };
}

describe("same-name define runtime export", () => {
  test("char+synth same name + later choice still produces a runnable program", () => {
    // The choice has START CONTENT (text before `[...]`), which generates
    // a return-target DivertTargetValue — the construct that previously
    // serialized null after the resolve pass aborted.
    const r = compile(
      `define raffles as character with
  name = "RAFFLES"
end

define raffles as synth with
  pitch = {
    frequency = 340
  }
end

-> main

scene main
  RAFFLES:
    Hello.
  choose
    + Start text [pick me] tail
      You picked it.
  end
  done
end
`,
    );
    expect(r.errors).toBe(0);
    // The key assertion: a runnable program was produced.
    expect(r.compiled).toBe(true);
    // Both structs reach the engine, type-namespaced.
    expect(r.program.context?.["character"]?.["raffles"]).toBeDefined();
    expect(r.program.context?.["synth"]?.["raffles"]).toBeDefined();
  });
});

// Same-name different-type defines (e.g. `define raffles as character` +
// `define raffles as synth` — the engine links a character to its voice
// synth BY NAME, so this pairing is required) must:
//   1. produce a RUNNABLE program (not just clean diagnostics), and
//   2. each be reachable as a type-namespaced runtime singleton
//      (character.raffles / synth.raffles), matching how `context`
//      namespaces them.
//
// Regression: the first define keeps the flat global slot; the second used
// to lose it AND get suppressed, so its `__def(...)` expression was never
// generated — its `-> __def` divert never got a runtimeDivert, and its
// `ResolveReferences` threw, ABORTING the whole resolve pass. Anything
// resolved after it (e.g. a later choice's start-content return target) was
// left with a null path, so `JsonSerialisation` crashed on a null
// `DivertTargetValue`, the exception was swallowed, and `program.compiled`
// was never set — the engine refused to run the game (black preview) despite
// 0 errors.
//
// Fix: the second define registers under a synthetic global key
// (`$type_name`) so it stays a real runtime table — `__def(table, "raffles",
// "synth")` registers it into the `synth` type table (so `synth.raffles`
// resolves), its expression generates normally, and the resolve pass no
// longer aborts. See FlowBase.AddNewVariableDeclaration.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

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
    compiled: (result.program as any).compiled,
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
    expect(r.compiled).toBeDefined();
    // Both structs reach the engine, type-namespaced.
    expect(r.program.context?.["character"]?.["raffles"]).toBeDefined();
    expect(r.program.context?.["synth"]?.["raffles"]).toBeDefined();
  });

  test("both same-name defines are reachable as type-namespaced runtime singletons", () => {
    const r = compile(
      `external host_record(v)

define raffles as character with
  name = "RAFFLES"
end

define raffles as synth with
  frequency = 340
end

& run()
done

function run()
host_record(character.raffles.name)
host_record(synth.raffles.frequency)
end
`,
    );
    expect(r.errors).toBe(0);
    expect(r.compiled).toBeDefined();

    const story = new RuntimeStory(r.compiled as Record<string, any>);
    const recorded: unknown[] = [];
    story.BindExternalFunction("host_record", (v: unknown) => {
      recorded.push(v);
      return v;
    });
    const storyErrors: string[] = [];
    story.onError = (m: string) => storyErrors.push(m);
    story.ContinueMaximally();

    expect(storyErrors).toEqual([]);
    // The first define owns the flat global; BOTH are reachable through
    // their type namespace.
    expect(recorded).toEqual(["RAFFLES", 340]);
  });
});

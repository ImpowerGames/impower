// SPIKE — display-as-Luau-call transport (the end state for eliminating the
// display double-parse; see memory project_display_parse_compiletime).
//
// Proves the GATING UNKNOWN at the Story (inkjs) level: a no-text stdlib call
// `display(<table>)` can carry a STRUCTURED, live-valued instruction table to
// the engine WITHOUT the runtime char-by-char re-parse, and still close a
// Continue beat. The compiler will eventually synthesize this call from a
// display statement; here we author it directly to isolate the transport.
//
// What this de-risks:
//   1. Transport      — the live ObjectValue round-trips through
//                       RunStdLibFunction onto the output stream and is
//                       retrievable via `story.currentDisplayInstructions`.
//   2. No re-parse    — `currentText` stays empty for the beat (the structured
//                       payload never becomes a string the runtime must scan).
//   3. Live interp    — `{interp}` holes are evaluated to live VALUES at call
//                       time (we beat Ren'Py, which string-splices).
//   4. Beat boundary  — the trailing `\n` closes the Continue beat, so the
//                       engine's per-beat / checkpoint loop fires unchanged.
//
// NOT yet covered (documented follow-ups): chained `>` breaks (multiple beats),
// save serialization of an ObjectValue in the output stream, and the engine
// (Game/InterpreterModule) side of the beat loop.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { ObjectValue } from "../../inkjs/engine/Value";

function compile(source: string) {
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
  if (!result.program.compiled) {
    throw new Error("spike fixture failed to compile");
  }
  const story = new RuntimeStory(
    result.program.compiled as Record<string, any>,
  );
  const errors: string[] = [];
  story.onError = (m: string) => errors.push(m);
  return { story, errors };
}

/** Read a top-level scalar entry out of an emitted instruction table. */
function field(obj: ObjectValue, key: string): unknown {
  return obj.value?.get(key)?.value;
}

describe("SPIKE: display() Luau-call transport", () => {
  test("a display({...}) call carries a structured table, not text", () => {
    const { story, errors } = compile(`& display({ kind = "text", body = "Hi." })
done
`);
    story.Continue();
    expect(errors).toEqual([]);

    // (2) No re-parse: the beat produced no visible text.
    expect((story.currentText ?? "").trim()).toBe("");

    // (1) Transport: exactly one structured instruction table arrived.
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    const table = instructions[0]!;
    expect(table).toBeInstanceOf(ObjectValue);
    expect(field(table, "kind")).toBe("text");
    expect(field(table, "body")).toBe("Hi.");
  });

  test("{interp} holes are evaluated to LIVE values at call time", () => {
    // The table value is the live number 5, not the string "score" — the
    // interpolation happened before the call, carried as a real value.
    const { story, errors } = compile(`store score = 5
& display({ kind = "text", value = score })
done
`);
    story.Continue();
    expect(errors).toEqual([]);

    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "value")).toBe(5);
  });

  test("the beat closes (Continue completes) at the display call", () => {
    // Content follows the display call; the trailing `\n` must end THIS beat
    // there rather than swallowing the next line into the same Continue.
    const { story, errors } = compile(`& display({ body = "first" })
& display({ body = "second" })
done
`);
    story.Continue();
    expect(errors).toEqual([]);
    // First beat: only the first table (the boundary stopped Continue).
    const first = story.currentDisplayInstructions;
    expect(first).toHaveLength(1);
    expect(field(first[0]!, "body")).toBe("first");

    expect(story.canContinue).toBe(true);
    story.Continue();
    const second = story.currentDisplayInstructions;
    expect(second).toHaveLength(1);
    expect(field(second[0]!, "body")).toBe("second");
  });
});

// Lowerer synthesis for the display-as-Luau-call transport: with the
// `experimentalDisplayCalls` flag on, a SIMPLE display statement (plain text,
// no cue/interpolation) lowers to a native `display({ target, text })` call
// instead of the legacy routing-tag + visible-text form. Authors write ordinary
// prose; the compiler synthesizes the call. Verified by running the compiled
// story and reading `currentDisplayInstructions` (structured) vs `currentText`
// (legacy).
//
// The flag is OFF by default, so the legacy path — and every existing golden —
// is unchanged; only opted-in compiles take the new path, and only for content
// the minimal table can represent (everything else falls back).

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { ObjectValue } from "../../inkjs/engine/Value";

function run(source: string, opts?: { experimentalDisplayCalls?: boolean }) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    experimentalDisplayCalls: opts?.experimentalDisplayCalls ?? false,
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
    throw new Error("lower-synthesis fixture failed to compile");
  }
  const story = new RuntimeStory(
    result.program.compiled as Record<string, any>,
  );
  const errors: string[] = [];
  story.onError = (m) => errors.push(m);
  story.Continue();
  return { story, errors };
}

function field(obj: ObjectValue, key: string): unknown {
  return obj.value?.get(key)?.value;
}

describe("lowerer synthesis: display() from authored prose", () => {
  test("a plain action line lowers to a display() call when the flag is on", () => {
    const { story, errors } = run(`The room is quiet.\ndone\n`, {
      experimentalDisplayCalls: true,
    });
    expect(errors).toEqual([]);
    // Structured, no re-parse: the body arrived as a display instruction table.
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "target")).toBe("action");
    expect(field(instructions[0]!, "text")).toBe("The room is quiet.");
    expect((story.currentText ?? "").trim()).toBe("");
  });

  test("without the flag the same line takes the legacy text path", () => {
    const { story, errors } = run(`The room is quiet.\ndone\n`);
    expect(errors).toEqual([]);
    // Legacy: visible text in currentText, no display instructions.
    expect(story.currentDisplayInstructions).toHaveLength(0);
    expect((story.currentText ?? "").trim()).toBe("The room is quiet.");
  });

  test("interpolated content falls back to the legacy path even with the flag", () => {
    // `{score}` is dynamic structure the minimal { target, text } table can't
    // carry yet, so the lowerer must fall back rather than drop the value.
    // (Plain action line — no leading `NAME:` that would read as a dialogue cue.)
    const { story, errors } = run(
      `store score = 5\nYou have {score} gold.\ndone\n`,
      { experimentalDisplayCalls: true },
    );
    expect(errors).toEqual([]);
    expect(story.currentDisplayInstructions).toHaveLength(0);
    expect((story.currentText ?? "").trim()).toBe("You have 5 gold.");
  });
});

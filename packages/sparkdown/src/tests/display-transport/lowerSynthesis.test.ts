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

  test("interpolation rides the table as a live-value string", () => {
    // `{score}` is evaluated at call time and concatenated into the table's
    // `text` (a StringExpression over the body), so the table carries the final
    // string — no flat-string re-parse, value carried live (we beat Ren'Py).
    const { story, errors } = run(
      `store score = 5\nYou have {score} gold.\ndone\n`,
      { experimentalDisplayCalls: true },
    );
    expect(errors).toEqual([]);
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "target")).toBe("action");
    expect(field(instructions[0]!, "text")).toBe("You have 5 gold.");
    expect((story.currentText ?? "").trim()).toBe("");
  });

  test("a dialogue line carries target=dialogue + the character cue", () => {
    const { story, errors } = run(`HERO: Hello there.\ndone\n`, {
      experimentalDisplayCalls: true,
    });
    expect(errors).toEqual([]);
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "target")).toBe("dialogue");
    expect(field(instructions[0]!, "character")).toBe("HERO");
    expect(field(instructions[0]!, "text")).toBe("Hello there.");
  });

  test("a line-end `>` split emits one display() call per beat", () => {
    // A `>` at END of a body line (followed by more content) splits BEATS —
    // each beat re-emits the cue as its own display() call (separate Continues
    // via the display-count boundary). A MID-line `>` instead stays one beat
    // with two boxes (parse()'s BREAK_BOX_REGEX), covered by the parity suite.
    const { story, errors } = run(
      `HERO:\n  First part. >\n  Second part.\ndone\n`,
      { experimentalDisplayCalls: true },
    );
    expect(errors).toEqual([]);
    // Beat 1.
    let instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "character")).toBe("HERO");
    expect(field(instructions[0]!, "text")).toBe("First part.");
    // Beat 2 (separate Continue — the display-count boundary split them).
    expect(story.canContinue).toBe(true);
    story.Continue();
    instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "character")).toBe("HERO");
    expect(field(instructions[0]!, "text")).toBe("Second part.");
  });

  test("emphasis markers ride as literal text in the table", () => {
    // `**`/`*` are not structured at compile time — they stay literal chars in
    // the table's `text` and the engine's parse() turns them into styled spans
    // at render (same as legacy).
    const { story, errors } = run(`This is **bold** here.\ndone\n`, {
      experimentalDisplayCalls: true,
    });
    expect(errors).toEqual([]);
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "text")).toBe("This is **bold** here.");
  });
});

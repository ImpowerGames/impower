// Lowerer synthesis for the display-as-Luau-call transport: a display
// statement lowers to a native `display({ target, text })` call. Authors write
// ordinary prose; the compiler synthesizes the call. Verified by running the
// compiled story and reading `currentDisplayInstructions` (structured) beside
// `currentText` (the step's visible text).

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { ObjectValue } from "../../inkjs/engine/Value";

function run(source: string) {
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
  return (obj.value?.get(key) as { value?: unknown } | undefined)?.value;
}

describe("lowerer synthesis: display() from authored prose", () => {
  test("a plain action line lowers to a display() call", () => {
    const { story, errors } = run(`The room is quiet.\ndone\n`);
    expect(errors).toEqual([]);
    // Structured, no re-parse: the body arrived as a display instruction table.
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "target")).toBe("action");
    expect(field(instructions[0]!, "text")).toBe("The room is quiet.");
    // `currentText` reports the step's visible text, table text included.
    expect((story.currentText ?? "").trim()).toBe("The room is quiet.");
  });

  test("interpolation rides the table as a live-value string", () => {
    // `{score}` is evaluated at call time and concatenated into the table's
    // `text` (a StringExpression over the body), so the table carries the final
    // string — no flat-string re-parse, value carried live (we beat Ren'Py).
    const { story, errors } = run(
      `store score = 5\nYou have {score} gold.\ndone\n`,
    );
    expect(errors).toEqual([]);
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "target")).toBe("action");
    expect(field(instructions[0]!, "text")).toBe("You have 5 gold.");
    expect((story.currentText ?? "").trim()).toBe("You have 5 gold.");
  });

  test("a dialogue line carries target=dialogue + the character cue", () => {
    const { story, errors } = run(`HERO: Hello there.\ndone\n`);
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
    // via the display-count boundary).
    const { story, errors } = run(
      `HERO:\n  First part. >\n  Second part.\ndone\n`,
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

  test("an inline conditional rides the table (evaluated at call time)", () => {
    const { story, errors } = run(
      `You feel {if 2 > 1 then "great" else "bad"} today.\ndone\n`,
    );
    expect(errors).toEqual([]);
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    // The chosen branch was string-captured into the table's text at call time.
    expect(field(instructions[0]!, "text")).toBe("You feel great today.");
  });

  test("an inline [[asset]] directive rides as text in the table", () => {
    // `[[show backdrop BG]]` is not a structural injection — it stays literal in
    // the body, so it takes the display() path and the engine's parse() extracts
    // the image directive from the table's text.
    const { story, errors } = run(
      `define BG as image with\n  src = "x"\nend\nThe sun rises. [[show backdrop BG]]\ndone\n`,
    );
    expect(errors).toEqual([]);
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "text")).toBe(
      "The sun rises. [[show backdrop BG]]",
    );
  });

  test("a trailing # tag rides the call's table", () => {
    // A `# tag` is metadata: it rides the table's `tags`, evaluated after the
    // text, and `display` puts it on the stream so it lands in the same
    // step's `currentTags`.
    const { story, errors } = run(`The bell rings. # ominous\ndone\n`);
    expect(errors).toEqual([]);
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "text")).toBe("The bell rings.");
    expect(story.currentTags).toEqual(["ominous"]);
  });

  test("emphasis markers ride as literal text in the table", () => {
    // `**`/`*` are not structured at compile time — they stay literal chars in
    // the table's `text` and the engine's parse() turns them into styled spans
    // at render.
    const { story, errors } = run(`This is **bold** here.\ndone\n`);
    expect(errors).toEqual([]);
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "text")).toBe("This is **bold** here.");
  });

  // Each line type below pins its routed target.
  for (const [label, marker, target] of [
    ["a title line", "^:", "title"],
    ["a scene heading", "$:", "heading"],
    ["a transition", "%:", "transitional"],
  ] as const) {
    test(`${label} takes the display() path with target=${target}`, () => {
      const { story, errors } = run(`${marker} SOME CONTENT\ndone\n`);
      expect(errors).toEqual([]);
      const instructions = story.currentDisplayInstructions;
      expect(instructions).toHaveLength(1);
      expect(field(instructions[0]!, "target")).toBe(target);
      expect(field(instructions[0]!, "text")).toBe("SOME CONTENT");
    });
  }

  test("block dialogue takes the display() path with the cue", () => {
    const { story, errors } = run(`HERO:\n  A block line.\ndone\n`);
    expect(errors).toEqual([]);
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "target")).toBe("dialogue");
    expect(field(instructions[0]!, "character")).toBe("HERO");
    expect(field(instructions[0]!, "text")).toBe("A block line.");
  });

  test("an inline sequence alternator rides the table (first pass captured)", () => {
    const { story, errors } = run(
      `The light {queue|"flickers"|"steadies"} now.\ndone\n`,
    );
    expect(errors).toEqual([]);
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "text")).toBe("The light flickers now.");
  });
});

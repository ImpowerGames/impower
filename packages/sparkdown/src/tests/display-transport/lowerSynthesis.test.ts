import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { ObjectValue } from "../../runtime/Value";

function run(source: string) {
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
  if (!result.program.chunks) {
    throw new Error("lower-synthesis fixture failed to compile");
  }
  const story = testStory(result.program.chunks);
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
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "target")).toBe("action");
    expect(field(instructions[0]!, "text")).toBe("The room is quiet.");
    expect((story.currentText ?? "").trim()).toBe("The room is quiet.");
  });

  test("interpolation rides the table as a live-value string", () => {
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
    const { story, errors } = run(
      `HERO:\n  First part. >\n  Second part.\ndone\n`,
    );
    expect(errors).toEqual([]);
    let instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "character")).toBe("HERO");
    expect(field(instructions[0]!, "text")).toBe("First part.");
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
    expect(field(instructions[0]!, "text")).toBe("You feel great today.");
  });

  test("an inline [[asset]] directive rides as text in the table", () => {
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
    const { story, errors } = run(`The bell rings. # ominous\ndone\n`);
    expect(errors).toEqual([]);
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "text")).toBe("The bell rings.");
    expect(story.currentTags).toEqual(["ominous"]);
  });

  test("emphasis markers ride as literal text in the table", () => {
    const { story, errors } = run(`This is **bold** here.\ndone\n`);
    expect(errors).toEqual([]);
    const instructions = story.currentDisplayInstructions;
    expect(instructions).toHaveLength(1);
    expect(field(instructions[0]!, "text")).toBe("This is **bold** here.");
  });

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

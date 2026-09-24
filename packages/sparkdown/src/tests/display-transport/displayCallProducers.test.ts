// Every producer of visible text lowers to `display(<table>)` calls: no step
// carries visible words outside a table. The expected text and tags of each
// step were captured at commit ffd59219a from the flat-text lowering these
// producers replaced, so the tables read as the flat text did.

import { describe, expect, test } from "vitest";
import { continueShowedSomething } from "../runtime/runtimeTestHarness";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { ControlCommand } from "../../inkjs/engine/ControlCommand";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { ObjectValue, StringValue } from "../../inkjs/engine/Value";

interface Step {
  text: string;
  tags: string[];
  // Visible words that reached the stream outside any table or tag.
  flatText: string;
  tables: Record<string, unknown>[];
}

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
    throw new Error("display-call producer fixture failed to compile");
  }
  return new RuntimeStory(result.program.compiled as Record<string, any>);
}

// Runs the story to its end, picking the first choice whenever it stops on
// choices.
function steps(source: string): Step[] {
  const story = compile(source);
  const errors: string[] = [];
  story.onError = (m) => errors.push(m);
  const out: Step[] = [];
  for (let guard = 0; guard < 50; guard++) {
    if (story.canContinue) {
      const text = story.Continue() ?? "";
      if (!continueShowedSomething(story)) continue;
      const tags = story.currentTags ?? [];
      let flatText = "";
      let inTag = false;
      for (const obj of story.state.outputStream) {
        if (obj instanceof ControlCommand) {
          if (obj.commandType === ControlCommand.CommandType.BeginTag) {
            inTag = true;
          } else if (obj.commandType === ControlCommand.CommandType.EndTag) {
            inTag = false;
          }
        } else if (!inTag && obj instanceof StringValue) {
          flatText += obj.value;
        }
      }
      out.push({
        text,
        tags: [...tags],
        flatText: flatText.trim(),
        tables: story.currentDisplayInstructions.map((t: ObjectValue) =>
          Object.fromEntries(
            [...(t.value?.entries() ?? [])].map(([k, v]) => [
              k,
              v instanceof ObjectValue
                ? [...(v.value?.values() ?? [])].map(
                    (e) => (e as { value?: unknown }).value,
                  )
                : (v as { value?: unknown }).value,
            ]),
          ),
        ),
      });
    } else if (story.currentChoices.length > 0) {
      story.ChooseChoiceIndex(0);
    } else {
      break;
    }
  }
  expect(errors).toEqual([]);
  return out;
}

// The steps of `source`: every step's visible words ride tables, and each
// step's text and tags are the `expected` pairs, captured from the flat-text
// lowering.
function displayCallSteps(
  source: string,
  expected: [text: string, tags: string[]][],
): Step[] {
  const run = steps(source);
  for (const step of run) {
    expect(step.flatText).toBe("");
  }
  expect(run.map((s) => [s.text, s.tags])).toEqual(expected);
  return run;
}

describe("display statements", () => {
  test("a line with a # tag carries the tag in its table", () => {
    const [step] = displayCallSteps(`The bell rings. # ominous\ndone\n`, [
      ["The bell rings.\n", ["ominous"]],
    ]);
    expect(step!.tags).toEqual(["ominous"]);
    expect(step!.tables).toEqual([
      { target: "action", text: "The bell rings.", tags: ["ominous"] },
    ]);
  });

  test("a dialogue line with two tags", () => {
    const [step] = displayCallSteps(`HERO: Goodbye. # final # quiet\ndone\n`, [
      ["Goodbye.\n", ["final", "quiet"]],
    ]);
    expect(step!.tags).toEqual(["final", "quiet"]);
    expect(step!.tables).toEqual([
      {
        target: "dialogue",
        character: "HERO",
        text: "Goodbye.",
        tags: ["final", "quiet"],
      },
    ]);
  });

  // The body's interpolation runs before the tag's, as written.
  test("a tag is evaluated after the line's text", () => {
    const [step] = displayCallSteps(
      `store x = 0\nSay {bump()} # {x}\ndone\n\nfunction bump()\nx += 1\nreturn "Hello"\nend\n`,
      [["Say Hello\n", ["1"]]],
    );
    expect(step!.tags).toEqual(["1"]);
  });

  test("a write with no layer names no target", () => {
    const [step] = displayCallSteps(`@: Layerless line.\ndone\n`, [
      ["Layerless line.\n", []],
    ]);
    expect(step!.tables).toEqual([{ text: "Layerless line." }]);
  });

  test("an empty body keeps its own step with empty text", () => {
    const [empty, next] = displayCallSteps(`$:\nNext.\ndone\n`, [
      ["\n", []],
      ["Next.\n", []],
    ]);
    expect(empty!.tables).toEqual([{ target: "heading", text: "" }]);
    expect(next!.tables).toEqual([{ target: "action", text: "Next." }]);
  });

  test("a load line is a table with a load field", () => {
    const [load, next] = steps(`load overworld\nThe world appears.\ndone\n`);
    expect(load!.flatText).toBe("");
    expect(load!.tables).toEqual([{ load: "overworld" }]);
    expect(next!.tables).toEqual([
      { target: "action", text: "The world appears." },
    ]);
  });

  test("a load line's names may interpolate", () => {
    const [load] = steps(`store w = "overworld"\nload {w} underworld\ndone\n`);
    expect(load!.tables).toEqual([{ load: "overworld underworld" }]);
  });

  test("a mid-line divert joins the target's first line", () => {
    const [step] = displayCallSteps(
      `-> a\n\nscene a\n  We hurried home to -> b\nend\n\nscene b\n  Savile Row.\n  done\nend\n`,
      [["We hurried home to Savile Row.\n", []]],
    );
    expect(step!.text).toBe("We hurried home to Savile Row.\n");
    expect(step!.tables).toEqual([
      { target: "action", text: "We hurried home to ", open: true },
      { target: "action", text: "Savile Row." },
    ]);
  });

  test("a mid-line load divert keeps its load step", () => {
    const run = displayCallSteps(
      `-> a\n\nscene a\n  We hurried home to -> load b\nend\n\nscene b\n  Savile Row.\n  done\nend\n`,
      [
        ["We hurried home to\n", []],
        ["[[load b]]\n", []],
        ["Savile Row.\n", []],
      ],
    );
    expect(run.map((s) => s.tables)).toEqual([
      [{ target: "action", text: "We hurried home to " }],
      [{ text: "[[load b]]" }],
      [{ target: "action", text: "Savile Row." }],
    ]);
  });
});

describe("producers outside display statements", () => {
  test("a standalone asset line", () => {
    const [step] = displayCallSteps(
      `[[show backdrop BG]] ((play music M))\nNext.\ndone\n`,
      [
        ["[[show backdrop BG]]((play music M))\n", []],
        ["Next.\n", []],
      ],
    );
    expect(step!.tables).toEqual([
      { text: "[[show backdrop BG]]((play music M))" },
    ]);
  });

  test("a load arrow's directive is its own step", () => {
    const [load, next] = displayCallSteps(
      `-> load b\n\nscene b\n  Here.\n  done\nend\n`,
      [
        ["[[load b]]\n", []],
        ["Here.\n", []],
      ],
    );
    expect(load!.tables).toEqual([{ text: "[[load b]]" }]);
    expect(next!.tables).toEqual([{ target: "action", text: "Here." }]);
  });

  test("a single-line block alternator arm, with its tag", () => {
    const [step] = displayCallSteps(`queue | A # t | B end\ndone\n`, [
      ["A\n", ["t"]],
    ]);
    expect(step!.tags).toEqual(["t"]);
    expect(step!.tables).toEqual([{ text: "A", tags: ["t"] }]);
  });

  test("a bare {expr} line", () => {
    const [step] = displayCallSteps(`{1 + 2}\ndone\n`, [["3\n", []]]);
    expect(step!.tables).toEqual([{ text: "3" }]);
  });

  test("a {x}{y} chain is one call", () => {
    const [step] = displayCallSteps(
      `store x = 5\nstore y = 4\n{x}{y}\ndone\n`,
      [["54\n", []]],
    );
    expect(step!.tables).toEqual([{ text: "54" }]);
  });

  test("print() pushes a table on the default target", () => {
    const run = displayCallSteps(
      `& f()\nNext.\ndone\n\nfunction f()\nprint("hi", 2)\nprint("two")\nend\n`,
      [
        ["hi 2\n", []],
        ["twoNext.\n", []],
      ],
    );
    expect(run[0]!.tables).toEqual([{ text: "hi 2" }]);
  });

  test("print() inside an interpolation lands in the enclosing line's text", () => {
    const [step] = steps(
      `Say {f()} now.\ndone\n\nfunction f()\nprint("hi")\nreturn "!"\nend\n`,
    );
    expect(step!.flatText).toBe("");
    expect(step!.tables).toEqual([{ target: "action", text: "Say hi! now." }]);
  });

  test("a picked choice echoes its text", () => {
    const run = displayCallSteps(
      `choose\n  * Take it\n    Taken.\nend\ndone\n`,
      [
        ["", []],
        ["Take it\n", []],
        ["Taken.\n", []],
      ],
    );
    expect(run.map((s) => s.tables)).toEqual([
      [],
      [{ text: "Take it" }],
      [{ target: "action", text: "Taken." }],
    ]);
  });

  test("a picked choice with bracketed text echoes the start and inner text", () => {
    const run = displayCallSteps(
      `choose\n  * Take[ it] now\n    Taken.\nend\ndone\n`,
      [
        ["", []],
        ["Take now\n", []],
        ["Taken.\n", []],
      ],
    );
    expect(run[1]!.tables).toEqual([{ text: "Take now" }]);
  });

  test("a picked choice with a tag carries it in the echo's table", () => {
    const run = displayCallSteps(
      `choose\n  * Take it # picked\n    Taken.\nend\ndone\n`,
      [
        ["", []],
        ["Take it\n", ["picked"]],
        ["Taken.\n", []],
      ],
    );
    expect(run[1]!.tags).toEqual(["picked"]);
    expect(run[1]!.tables).toHaveLength(1);
    expect(run[1]!.tables[0]!["tags"]).toEqual(["picked"]);
  });

  test("a bracketed picked choice with a tag after the brackets", () => {
    const run = displayCallSteps(
      `choose\n  * Take[ it] now # picked\n    Taken.\nend\ndone\n`,
      [
        ["", []],
        ["Take now\n", ["picked"]],
        ["Taken.\n", []],
      ],
    );
    expect(run[1]!.tags).toEqual(["picked"]);
    expect(run[1]!.tables).toHaveLength(1);
    expect(run[1]!.tables[0]!["tags"]).toEqual(["picked"]);
  });

  // A tag before the brackets runs before the chosen-only text, as written.
  test("a tag in a choice's start content is evaluated before its chosen-only text", () => {
    const run = displayCallSteps(
      `store x = 0\nchoose\n  * Take # {{bump}}[ label] {x}\n    Taken.\nend\ndone\n\nfunction bump()\nx += 1\nreturn x\nend\n`,
      [
        ["", []],
        ["Take 2\n", ["2"]],
        ["Taken.\n", []],
      ],
    );
    expect(run[1]!.text).toBe("Take 2\n");
    expect(run[1]!.tables).toHaveLength(1);
  });

  test("tags between a choice's words keep their evaluation order", () => {
    const run = displayCallSteps(
      `store x = 0\nchoose\n  * {bump()} # {x}[ label] {bump()} # {x}\n    Taken.\nend\ndone\n\nfunction bump()\nx += 1\nreturn x\nend\n`,
      [
        ["", []],
        ["2 3\n", ["2", "3"]],
        ["Taken.\n", []],
      ],
    );
    expect(run[1]!.tags).toEqual(["2", "3"]);
  });

  test("a picked choice ending in an inline divert joins the target's line", () => {
    const run = displayCallSteps(
      `-> a\n\nscene a\n  choose\n    * Take it -> b\n  end\nend\n\nscene b\n  now.\n  done\nend\n`,
      [
        ["", []],
        ["Take it now.\n", []],
      ],
    );
    expect(run[1]!.text).toBe("Take it now.\n");
    expect(run[1]!.tables).toEqual([
      { text: "Take it ", open: true },
      { target: "action", text: "now." },
    ]);
  });
});

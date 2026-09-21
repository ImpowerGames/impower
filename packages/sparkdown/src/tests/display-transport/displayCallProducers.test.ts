// With `experimentalDisplayCalls` on, every producer of visible text lowers to
// `display(<table>)` calls: no step carries a routing tag or visible words
// outside a table, and each step reads the same as with the option off.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { isDisplayRoutingTag } from "../../compiler/utils/displayRoutingTag";
import { ControlCommand } from "../../inkjs/engine/ControlCommand";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { ObjectValue, StringValue } from "../../inkjs/engine/Value";

interface Step {
  text: string;
  authorTags: string[];
  routingTags: string[];
  // Visible words that reached the stream outside any table or tag.
  flatText: string;
  tables: Record<string, unknown>[];
}

function compile(source: string, experimentalDisplayCalls: boolean) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    experimentalDisplayCalls,
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
function steps(source: string, experimentalDisplayCalls: boolean): Step[] {
  const story = compile(source, experimentalDisplayCalls);
  const errors: string[] = [];
  story.onError = (m) => errors.push(m);
  const out: Step[] = [];
  for (let guard = 0; guard < 50; guard++) {
    if (story.canContinue) {
      const text = story.Continue() ?? "";
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
        authorTags: tags.filter((t) => !isDisplayRoutingTag(t)),
        routingTags: tags.filter(isDisplayRoutingTag),
        flatText: flatText.trim(),
        tables: story.currentDisplayInstructions.map((t: ObjectValue) =>
          Object.fromEntries(
            [...(t.value?.entries() ?? [])].map(([k, v]) => [
              k,
              (v as { value?: unknown }).value,
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

// The option-on steps: every step's visible words ride tables, no step has a
// routing tag, and the text and author tags match the option-off run.
function displayCallSteps(source: string): Step[] {
  const on = steps(source, true);
  const off = steps(source, false);
  expect(on.length).toBeGreaterThan(0);
  for (const step of on) {
    expect(step.routingTags).toEqual([]);
    expect(step.flatText).toBe("");
  }
  expect(on.map((s) => s.text)).toEqual(off.map((s) => s.text));
  expect(on.map((s) => s.authorTags)).toEqual(off.map((s) => s.authorTags));
  return on;
}

describe("display statements that used to fall back (#687)", () => {
  test("a line with a # tag carries the tag beside its table", () => {
    const [step] = displayCallSteps(`The bell rings. # ominous\ndone\n`);
    expect(step!.authorTags).toEqual(["ominous"]);
    expect(step!.tables).toEqual([
      { target: "action", text: "The bell rings." },
    ]);
  });

  test("a dialogue line with two tags", () => {
    const [step] = displayCallSteps(`HERO: Goodbye. # final # quiet\ndone\n`);
    expect(step!.authorTags).toEqual(["final", "quiet"]);
    expect(step!.tables).toEqual([
      { target: "dialogue", character: "HERO", text: "Goodbye." },
    ]);
  });

  test("a write with no layer names no target", () => {
    const [step] = displayCallSteps(`@: Layerless line.\ndone\n`);
    expect(step!.tables).toEqual([{ text: "Layerless line." }]);
  });

  test("an empty body keeps its own step with empty text", () => {
    const [empty, next] = displayCallSteps(`$:\nNext.\ndone\n`);
    expect(empty!.tables).toEqual([{ target: "heading", text: "" }]);
    expect(next!.tables).toEqual([{ target: "action", text: "Next." }]);
  });

  test("a load line is a table with a load field", () => {
    const [load, next] = steps(`load overworld\nThe world appears.\ndone\n`, true);
    expect(load!.routingTags).toEqual([]);
    expect(load!.flatText).toBe("");
    expect(load!.tables).toEqual([{ load: "overworld" }]);
    expect(next!.tables).toEqual([
      { target: "action", text: "The world appears." },
    ]);
  });

  test("a load line's names may interpolate", () => {
    const [load] = steps(`store w = "overworld"\nload {w} underworld\ndone\n`, true);
    expect(load!.tables).toEqual([{ load: "overworld underworld" }]);
  });

  test("a mid-line divert joins the target's first line", () => {
    const [step] = displayCallSteps(
      `-> a\n\nscene a\n  We hurried home to -> b\nend\n\nscene b\n  Savile Row.\n  done\nend\n`,
    );
    expect(step!.text).toBe("We hurried home to Savile Row.\n");
    expect(step!.tables).toEqual([
      { target: "action", text: "We hurried home to " },
      { target: "action", text: "Savile Row." },
    ]);
  });

  test("a mid-line load divert keeps its load step", () => {
    const run = displayCallSteps(
      `-> a\n\nscene a\n  We hurried home to -> load b\nend\n\nscene b\n  Savile Row.\n  done\nend\n`,
    );
    expect(run.map((s) => s.tables)).toEqual([
      [{ target: "action", text: "We hurried home to " }],
      [{ text: "[[load b]]" }],
      [{ target: "action", text: "Savile Row." }],
    ]);
  });
});

describe("producers outside display statements (#688)", () => {
  test("a standalone asset line", () => {
    const [step] = displayCallSteps(
      `[[show backdrop BG]] ((play music M))\nNext.\ndone\n`,
    );
    expect(step!.tables).toEqual([
      { text: "[[show backdrop BG]]((play music M))" },
    ]);
  });

  test("a load arrow's directive is its own step", () => {
    const [load, next] = displayCallSteps(
      `-> load b\n\nscene b\n  Here.\n  done\nend\n`,
    );
    expect(load!.tables).toEqual([{ text: "[[load b]]" }]);
    expect(next!.tables).toEqual([{ target: "action", text: "Here." }]);
  });

  test("a single-line block alternator arm, with its tag", () => {
    const [step] = displayCallSteps(`queue | A # t | B end\ndone\n`);
    expect(step!.authorTags).toEqual(["t"]);
    expect(step!.tables).toEqual([{ text: "A" }]);
  });

  test("a bare {expr} line", () => {
    const [step] = displayCallSteps(`{1 + 2}\ndone\n`);
    expect(step!.tables).toEqual([{ text: "3" }]);
  });

  test("a {x}{y} chain is one call", () => {
    const [step] = displayCallSteps(
      `store x = 5\nstore y = 4\n{x}{y}\ndone\n`,
    );
    expect(step!.tables).toEqual([{ text: "54" }]);
  });

  test("print() pushes a table on the default target", () => {
    const run = displayCallSteps(
      `& f()\nNext.\ndone\n\nfunction f()\nprint("hi", 2)\nprint("two")\nend\n`,
    );
    expect(run[0]!.tables).toEqual([{ text: "hi 2" }]);
  });

  test("print() inside an interpolation lands in the enclosing line's text", () => {
    const [step] = steps(
      `Say {f()} now.\ndone\n\nfunction f()\nprint("hi")\nreturn "!"\nend\n`,
      true,
    );
    expect(step!.flatText).toBe("");
    expect(step!.tables).toEqual([{ target: "action", text: "Say hi! now." }]);
  });

  test("a picked choice echoes its text", () => {
    const run = displayCallSteps(`choose\n  * Take it\n    Taken.\nend\ndone\n`);
    expect(run.map((s) => s.tables)).toEqual([
      [],
      [{ text: "Take it" }],
      [{ target: "action", text: "Taken." }],
    ]);
  });

  test("a picked choice with bracketed text echoes the start and inner text", () => {
    const run = displayCallSteps(
      `choose\n  * Take[ it] now\n    Taken.\nend\ndone\n`,
    );
    expect(run[1]!.tables).toEqual([{ text: "Take now" }]);
  });

  test("a picked choice ending in an inline divert joins the target's line", () => {
    const run = displayCallSteps(
      `-> a\n\nscene a\n  choose\n    * Take it -> b\n  end\nend\n\nscene b\n  now.\n  done\nend\n`,
    );
    expect(run[1]!.text).toBe("Take it now.\n");
    expect(run[1]!.tables).toEqual([
      { text: "Take it " },
      { target: "action", text: "now." },
    ]);
  });
});

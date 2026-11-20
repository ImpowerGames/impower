import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "file:///main.sd";

const PORTRAIT = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="face.happy:default" id="happy">
  <g data-name="lips:mouth.closed:default" id="mc"/>
  <g data-name="lips:mouth.open" id="mo"/>
  <g data-name="lips:mouth.teeth" id="mt"/>
  <g data-name="lips:mouth.wide" id="mw"/>
</g>
</svg>`;

const TALK = `morph talk {
  blend = cut

  keyframes {
    0%   { mouth { state = mouth.teeth } }
    20%  { mouth { state = mouth.open } }
    40%  { mouth { state = mouth.teeth } }
    60%  { mouth { state = mouth.wide } }
    80%  { mouth { state = mouth.teeth } }
    100% { mouth { state = mouth.closed } }
  }

  timing {
    trigger = speech
    duration = 0.5
    easing = linear
  }

  replay {
    { from = 0%; to = 40%; chance = 50% }
    { from = 40%; to = 80%; chance = 25%; count = 2 }
  }
}
`;

const withStart = (text: string) => `${text}${text.endsWith("\n") ? "" : "\n"}scene start\nend\n`;

function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: withStart(text), version: 1, languageId: "sparkdown" },
      { uri: "file:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: PORTRAIT },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

function reported(text: string) {
  const program = compile(text);
  const lines = withStart(text).split("\n");
  return (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.code === "morph")
    .map((d) => {
      const { start, end } = d.range;
      return {
        text: (start.line === end.line ? lines[start.line]!.slice(start.character, end.character) : lines[start.line]!.slice(start.character)).trim(),
        message: typeof d.message === "string" ? d.message : d.message.value,
        severity: d.severity,
      };
    });
}

const withReplay = (body: string) => TALK.replace(/  replay \{[\s\S]*?\n  \}\n/, `  replay {\n${body}  }\n`);

const ITEM = "Each item in `replay` is a range's field, such as `chance = 50%`, or a `{ … }` entry holding one range's fields.";

describe("a replay block of several entries (#2581)", () => {
  test("the two-entry example reports nothing and reads as two ranges", () => {
    expect(reported(TALK)).toEqual([]);
    expect(compile(TALK).context?.["morph"]?.["talk"]?.replay).toEqual([
      { from: "0%", to: "40%", chance: "50%" },
      { from: "40%", to: "80%", chance: "25%", count: 2 },
    ]);
  });

  test.each([
    ["chance = 150%", "150%", "`chance` is a percentage from `0%` to `100%` or a number from 0 to 1, such as `chance = 50%`."],
    ["from = -5%; chance = 50%", "-5%", "`from` is a percentage from `0%` to `100%` or a number from 0 to 1, such as `from = 0%`."],
    ["chance = 50%; count = 0", "0", "`count` is the most replays this range makes in one play: a whole number of at least 1."],
    ["chance = 50%; delay_min = 0.17", "0.17", "`delay_min` needs `delay_max`: the pause before a replay is drawn between the two."],
    ["chance = 50%; delay_min = 0.35; delay_max = 0.17", "0.17", "`delay_max` (0.17) must be at least `delay_min` (0.35)."],
    ["chance = 50%; weight = 2", "weight", "Unknown morph field `weight`."],
    ["chance = 50%; duration = 1", "duration", "`duration` belongs in `timing { … }`."],
  ])("`{ %s }` in the second entry is reported at that entry's field", (fields, text, message) => {
    expect(reported(withReplay(`    { from = 0%; to = 40%; chance = 50% }\n    { to = 80%; ${fields} }\n`))).toEqual([{ text, message, severity: 1 }]);
  });

  test("a `from` at or past its entry's `to` is reported at that entry's `to`", () => {
    expect(reported(withReplay("    { from = 0%; to = 40%; chance = 50% }\n    { from = 60%; to = 40%; chance = 50% }\n"))).toEqual([
      {
        text: "40%",
        message: "`replay` turns back at `to` and resumes from `from`, so `from` must be below `to`: `from` is `60%` and `to` is `40%`.",
        severity: 1,
      },
    ]);
  });

  test("an entry with no chance is reported on that entry", () => {
    expect(reported(withReplay("    { from = 0%; to = 40%; chance = 50% }\n    { from = 40%; to = 80% }\n"))).toEqual([
      {
        text: "{",
        message: "This `replay` entry needs a `chance`: how likely each replay is, such as `chance = 50%`.",
        severity: 1,
      },
    ]);
  });

  test("an entry whose stretch takes no time under the easing is a warning on that entry", () => {
    const text = withReplay("    { from = 0%; to = 40%; chance = 50% }\n    { from = 40%; to = 60%; chance = 50% }\n").replace(
      "easing = linear",
      "easing = steps(3)",
    );
    expect(reported(text)).toEqual([
      {
        text: "{",
        message:
          "Under `easing = steps(3)` this play reaches `to` at the same moment as `from`, so the stretch between them takes no time and the play never replays. Move `from` and `to` onto different steps.",
        severity: 2,
      },
    ]);
  });
});

describe("what a replay block may hold (#2581)", () => {
  test("fields and entries together are an error on the block", () => {
    expect(reported(withReplay("    chance = 50%\n    { from = 0%; to = 40%; chance = 50% }\n"))).toEqual([
      {
        text: "replay",
        message:
          "`replay` holds one range's fields, such as `replay { from = 0%; to = 66.667%; chance = 50% }`, or `{ … }` entries, one range each, not both.",
        severity: 1,
      },
    ]);
  });

  test("an item that is neither a field nor an entry is an error on that item", () => {
    expect(reported(withReplay("    { from = 0%; to = 40%; chance = 50% }\n    7\n"))).toEqual([{ text: "7", message: ITEM, severity: 1 }]);
    expect(reported(withReplay("    { from = 0%; to = 40%; chance = 50% }\n    wide { chance = 50% }\n"))).toEqual([
      { text: "wide {", message: ITEM, severity: 1 },
    ]);
  });
});

describe("an inherited list of replays (#2581)", () => {
  const SINGLE = TALK.replace(/  replay \{[\s\S]*?\n  \}\n/, "  replay {\n    to = 60%\n    chance = 10%\n    count = 3\n  }\n");
  const withChild = (parent: string, replay: string) =>
    `${parent.replace("morph talk {", "morph talk {\n  default = true")}\nmorph quiet as talk {\n  replay {\n${replay}  }\n}\n`;

  test("a child's list replaces its parent's single block", () => {
    const text = withChild(SINGLE, "    { from = 40%; to = 80%; chance = 25% }\n");
    expect(compile(text).context?.["morph"]?.["quiet"]?.replay).toEqual([{ from: "40%", to: "80%", chance: "25%" }]);
    expect(reported(text)).toEqual([]);
  });

  test("a child's single block replaces its parent's list", () => {
    const text = withChild(TALK, "    from = 20%\n    chance = 5%\n");
    expect(compile(text).context?.["morph"]?.["quiet"]?.replay).toEqual({ from: "20%", chance: "5%" });
    expect(reported(text)).toEqual([]);
  });

  test("a child that writes no replay inherits its parent's list, and an invalid inherited entry is reported where the child names its parent", () => {
    const text = `${TALK.replace("count = 2", "count = 0")}\nmorph quiet as talk {\n  blend = cut\n}\n`;
    expect(compile(text).context?.["morph"]?.["quiet"]?.replay).toHaveLength(2);
    expect(reported(text)).toEqual([
      { text: "0", message: "`count` is the most replays this range makes in one play: a whole number of at least 1.", severity: 1 },
      { text: "talk", message: "`replay.count`, inherited: `count` is the most replays this range makes in one play: a whole number of at least 1.", severity: 1 },
    ]);
  });
});

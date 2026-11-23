import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "file:///main.sd";

const PORTRAIT = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="face.happy:default" id="happy">
  <g data-name="eyelash-left:eyes.open:default" id="la"/>
  <g data-name="eyelash-left:eyes.closed" id="lc"/>
  <g data-name="lips:mouth.closed:default" id="mc"/>
  <g data-name="lips:mouth.open" id="mo"/>
  <g data-name="lips:mouth.teeth" id="mt"/>
</g>
</svg>`;

const TALK = `morph talk {
  blend = cut

  keyframes {
    0%      { mouth { state = mouth.teeth } }
    33.333% { mouth { state = mouth.open } }
    66.667% { mouth { state = mouth.teeth } }
    100%    { mouth { state = mouth.closed } }
  }

  timing {
    trigger = speech
    duration = 0.35
    easing = linear
    iteration_delay_min = 0.10
    iteration_delay_max = 0.233333
  }

  replay {
    from = 0%
    to = 66.667%
    chance = 50%
  }
}
`;

const BLINK = `morph blink {
  method = bend
  unless = eyes.closed

  keyframes {
    0%      { eyes { state = open } }
    33.333% { eyes { state = closed } }
    100%    { eyes { state = open } }
  }

  timing {
    duration = 0.25
    easing = steps(3)
    iterations = infinite
    iteration_delay_min = 2
    iteration_delay_max = 6
  }

  replay {
    chance = 12%
    delay_min = 0.17
    delay_max = 0.35
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

interface Found {
  message: string;
  severity: number | undefined;
  text: string;
}

function morphDiagnostics(text: string): Found[] {
  const program = compile(text);
  const lines = withStart(text).split("\n");
  return (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.code === "morph")
    .map((d) => {
      const { start, end } = d.range;
      return {
        message: typeof d.message === "string" ? d.message : d.message.value,
        severity: d.severity,
        text: start.line === end.line ? lines[start.line]!.slice(start.character, end.character) : lines[start.line]!.slice(start.character),
      };
    });
}

describe("the morph replay block (#2580)", () => {
  test("the talk and blink examples report nothing", () => {
    expect(morphDiagnostics(TALK)).toEqual([]);
    expect(morphDiagnostics(BLINK)).toEqual([]);
  });
});

const withReplay = (block: string, timing = "") =>
  TALK.replace(/  replay \{[\s\S]*?\n  \}\n/, block).replace("    easing = linear\n", `    easing = linear\n${timing}`);

const reported = (text: string) => morphDiagnostics(text).map((d) => ({ text: d.text, message: d.message, severity: d.severity }));

describe("the replay block's checks (#2580)", () => {
  test("`replay` written as a value is reported at the value", () => {
    expect(reported(withReplay("  replay = 50%\n"))).toEqual([
      { text: "50%", message: "`replay` is a block of fields: `replay { from = 0%; to = 66.667%; chance = 50% }`.", severity: 1 },
    ]);
  });

  test("a block with no chance is reported on the block", () => {
    expect(reported(withReplay("  replay {\n    to = 50%\n  }\n"))).toEqual([
      { text: "replay", message: "This `replay` block needs a `chance`: how likely each replay is, such as `chance = 50%`.", severity: 1 },
    ]);
  });

  test.each([
    ["chance", "150%", "`chance` is a percentage from `0%` to `100%` or a number from 0 to 1, such as `chance = 50%`."],
    ["chance", "fast", "`chance` is a percentage from `0%` to `100%` or a number from 0 to 1, such as `chance = 50%`."],
    ["from", "-5%", "`from` is a percentage from `0%` to `100%` or a number from 0 to 1, such as `from = 0%`."],
    ["to", "2", "`to` is a percentage from `0%` to `100%` or a number from 0 to 1, such as `to = 66.667%`."],
    ["count", "0", "`count` is the most replays this range makes in one play: a whole number from 1 to 1000."],
    ["count", "1.5", "`count` is the most replays this range makes in one play: a whole number from 1 to 1000."],
    ["count", "1001", "`count` is the most replays this range makes in one play: a whole number from 1 to 1000."],
    ["count", "100000000", "`count` is the most replays this range makes in one play: a whole number from 1 to 1000."],
    ["count", "99999999999999", "`count` is the most replays this range makes in one play: a whole number from 1 to 1000."],
  ])("`%s = %s` is reported at the value", (field, value, message) => {
    const block = `  replay {\n    ${field === "chance" ? "" : "chance = 50%\n    "}${field} = ${value}\n  }\n`;
    expect(reported(withReplay(block))).toEqual([{ text: value, message, severity: 1 }]);
  });

  test.each(["1", "1000"])("`count = %s` is accepted", (value) => {
    expect(reported(withReplay(`  replay {\n    chance = 100%\n    count = ${value}\n  }\n`))).toEqual([]);
  });

  test("a `from` at or past its `to` is reported on `to`", () => {
    expect(reported(withReplay("  replay {\n    from = 50%\n    to = 40%\n    chance = 50%\n  }\n"))).toEqual([
      {
        text: "40%",
        message: "`replay` turns back at `to` and resumes from `from`, so `from` must be below `to`: `from` is `50%` and `to` is `40%`.",
        severity: 1,
      },
    ]);
  });

  test("the pause bounds are numbers of seconds, written together, the longest at least the shortest", () => {
    const block = (fields: string) => `  replay {\n    chance = 50%\n${fields}  }\n`;
    expect(reported(withReplay(block("    delay_min = -1\n    delay_max = 1\n")))).toEqual([
      { text: "-1", message: "`delay_min` must not be negative.", severity: 1 },
    ]);
    expect(reported(withReplay(block("    delay_min = 170ms\n    delay_max = 1\n")))).toEqual([
      { text: "170ms", message: "Timing values are numbers of seconds: write `delay_min = 170` (in seconds).", severity: 1 },
    ]);
    expect(reported(withReplay(block("    delay_min = 0.17\n")))).toEqual([
      { text: "0.17", message: "`delay_min` needs `delay_max`: the pause before a replay is drawn between the two.", severity: 1 },
    ]);
    expect(reported(withReplay(block("    delay_min = 0.35\n    delay_max = 0.17\n")))).toEqual([
      { text: "0.17", message: "`delay_max` (0.17) must be at least `delay_min` (0.35).", severity: 1 },
    ]);
  });

  test("an unknown field in the block, and a replay field written elsewhere, are told where they belong", () => {
    expect(reported(withReplay("  replay {\n    chance = 50%\n    duration = 1\n    weight = 2\n  }\n"))).toEqual([
      { text: "duration", message: "`duration` belongs in `timing { … }`.", severity: 1 },
      { text: "weight", message: "Unknown morph field `weight`.", severity: 1 },
    ]);
    expect(reported(withReplay("  replay {\n    chance = 50%\n  }\n", "    chance = 50%\n"))).toEqual([
      { text: "chance", message: "`chance` belongs in `replay { … }`.", severity: 1 },
    ]);
  });

  test.each(["start", "end"])("`%s` in the block is an unknown field", (field) => {
    expect(reported(withReplay(`  replay {\n    chance = 50%\n    ${field} = 50%\n  }\n`))).toEqual([
      { text: field, message: `Unknown morph field \`${field}\`.`, severity: 1 },
    ]);
  });

  test("a curve whose early peak falls far short of `to` is not taken to reach it, so no zero-time warning", () => {
    const text = withReplay("  replay {\n    from = 20%\n    to = 80%\n    chance = 50%\n  }\n").replace(
      "easing = linear",
      "easing = cubic-bezier(0.3333333333333333, 1, 0.6666666666666666, -100000000000000)",
    );
    expect(reported(text)).toEqual([]);
  });

  test("a stretch that takes no time under the easing is a warning on the block", () => {
    const text = withReplay("  replay {\n    from = 40%\n    to = 60%\n    chance = 50%\n  }\n").replace("easing = linear", "easing = steps(3)");
    expect(reported(text)).toEqual([
      {
        text: "replay",
        message:
          "Under `easing = steps(3)` this play reaches `to` at the same moment as `from`, so the stretch between them takes no time and the play never replays. Move `from` and `to` onto different steps.",
        severity: 2,
      },
    ]);
  });
});

describe("an inherited replay (#2580)", () => {
  const CHILD = `${TALK}\nmorph quiet as talk {\n  default = true\n  replay {\n    chance = 0%\n  }\n}\n`;

  test("a child's block overrides its parent's field by field", () => {
    const program = compile(CHILD);
    expect(program.context?.["morph"]?.["quiet"]?.replay).toEqual({ from: "0%", to: "66.667%", chance: "0%" });
    expect(morphDiagnostics(CHILD)).toEqual([]);
  });

  test("an invalid inherited value is reported where the child names its parent", () => {
    const text = `${TALK.replace("chance = 50%", "chance = 50%\n    count = 0")}\nmorph quiet as talk {\n  default = true\n  replay {\n    chance = 25%\n  }\n}\n`;
    expect(reported(text)).toEqual([
      { text: "0", message: "`count` is the most replays this range makes in one play: a whole number from 1 to 1000.", severity: 1 },
      { text: "talk", message: "`replay.count`, inherited: `count` is the most replays this range makes in one play: a whole number from 1 to 1000.", severity: 1 },
    ]);
  });
});

describe("replay is not part of a morph's recipe (#2580)", () => {
  const BUNNY = `${TALK}\nimage bunny_talk = bunny\n`;
  const recipesOf = (text: string) => {
    const program = compile(text);
    return { recipes: program.morphs?.recipes, variants: JSON.stringify(program.morphs?.variants) };
  };

  test("adding a replay, and editing one, leaves the recipes and every reference key as they were", () => {
    const written = recipesOf(BUNNY);
    expect(written.recipes?.["talk"]).toBeDefined();
    expect(recipesOf(BUNNY.replace(/  replay \{[\s\S]*?\n  \}\n/, ""))).toEqual(written);
    expect(recipesOf(BUNNY.replace("chance = 50%", "chance = 25%\n    count = 2"))).toEqual(written);
  });
});

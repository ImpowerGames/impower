// What each display statement renders through `display(<table>)`: per beat,
// each target's text (as runs of one style, so emphasis shows), the image
// directives and the load names. A dialogue beat's speaker is its
// `character_name` text. The expected beats were captured at commit
// ffd59219a from the flat-text lowering that `display()` replaced, so each
// script renders what it rendered there.

import { describe, expect, test } from "vitest";
import type { Instructions } from "../../game/core/types/Instructions";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SCREEN = `define HERO as character with
  name = "HERO"
end

layout main with
  title:
    text
  heading:
    text
  transitional:
    text
  action:
    text
  dialogue:
    character_info:
      character_name:
        text
      character_parenthetical:
        text
    text
end
`;

const IMAGE_SCREEN = `define HERO as character with
  name = "HERO"
end

define BG as image with
  src = "https://example.com/bg.png"
end

layout main with
  stage:
    backdrop:
      image
  action:
    text
  dialogue:
    character_info:
      character_name:
        text
    text
end
`;

function story(body: string, screen = SCREEN) {
  return `${screen}\n-> start\n\nscene start\n${body}\nend\n`;
}

type Run = string | { text: string; style: Record<string, unknown> };
interface Beat {
  load?: unknown[];
  text?: Record<string, Run[]>;
  image?: Record<string, { control: string; assets?: string[] }[]>;
}

// One beat as authored behaviour: each target's text as runs of equal style,
// the image directives and the load names.
function summarize(beat: Instructions): Beat {
  const out: Beat = {};
  if (beat.load) out.load = beat.load;
  if (beat.text) {
    out.text = {};
    for (const [target, events] of Object.entries(beat.text)) {
      const runs: { text: string; style: string }[] = [];
      for (const e of events) {
        const style = e.style ? JSON.stringify(e.style) : "";
        const last = runs.at(-1);
        if (last && last.style === style) last.text += e.text;
        else runs.push({ text: e.text, style });
      }
      out.text[target] = runs.map((r) =>
        r.style ? { text: r.text, style: JSON.parse(r.style) } : r.text,
      );
    }
  }
  if (beat.image) {
    out.image = {};
    for (const [target, events] of Object.entries(beat.image)) {
      out.image[target] = events.map((e) => ({
        control: e.control,
        assets: e.assets,
      }));
    }
  }
  return out;
}

// Drive every beat of the scene, displaying each; a story stopped on choices
// takes the first one.
async function renderedBeats(source: string): Promise<Beat[]> {
  const harness = createHarness(source);
  await harness.ready;
  harness.jumpTo("start");
  harness.reset();
  const out: Beat[] = [];
  for (let guard = 0; guard < 50; guard++) {
    const beat = harness.nextBeat();
    if (beat) {
      out.push(summarize(beat));
      await harness.display(beat, true);
      await flushMicrotasks();
      continue;
    }
    const s: any = harness.game.story;
    if (s.canContinue || s.currentChoices.length === 0) break;
    s.ChooseChoiceIndex(0);
  }
  return out;
}

const FIXTURES: [label: string, body: string, beats: Beat[]][] = [
  [
    "plain action",
    `  The room is quiet.`,
    [{ text: { action: ["The room is quiet."] } }],
  ],
  [
    "action with interpolation",
    `  You have {2 + 3} apples.`,
    [{ text: { action: ["You have 5 apples."] } }],
  ],
  [
    "action with bold + italic emphasis",
    `  This is **bold** and *italic* text.`,
    [
      {
        text: {
          action: [
            "This is ",
            { text: "bold", style: { font_weight: "bold" } },
            " and ",
            { text: "italic", style: { font_style: "italic" } },
            " text.",
          ],
        },
      },
    ],
  ],
  [
    "action with underline + centered",
    `  Some _underlined_ and ^centered^ words.`,
    [
      {
        text: {
          action: [
            "Some ",
            { text: "underlined", style: { text_decoration: "underline" } },
            " and ",
            { text: "centered", style: { text_align: "center" } },
            " words.",
          ],
        },
      },
    ],
  ],
  [
    "dialogue line",
    `  HERO: Hello there.`,
    [{ text: { dialogue: ["Hello there."], character_name: ["HERO"] } }],
  ],
  [
    "dialogue with interpolation",
    `  HERO: I count {10 * 2} coins.`,
    [{ text: { dialogue: ["I count 20 coins."], character_name: ["HERO"] } }],
  ],
  [
    "dialogue with parenthetical + position",
    `  HERO (cheerful) >: Wonderful!`,
    [
      {
        text: {
          dialogue: ["Wonderful!"],
          character_name: ["HERO (cheerful) >"],
        },
      },
    ],
  ],
  ["title", `  ^: My Title`, [{ text: { title: ["My Title"] } }]],
  [
    "scene heading",
    `  $: INT. HOUSE - DAY`,
    [{ text: { heading: ["INT. HOUSE - DAY"] } }],
  ],
  ["transition", `  %: CUT TO:`, [{ text: { transitional: ["CUT TO:"] } }]],
  [
    "block dialogue (multi-line)",
    `  HERO:\n    First line.\n    Second line.`,
    [
      {
        text: {
          dialogue: ["First line.\nSecond line."],
          character_name: ["HERO"],
        },
      },
    ],
  ],
  [
    "chained dialogue (mid-line > break)",
    `  HERO: First part. > Second part.`,
    [
      { text: { dialogue: ["First part."], character_name: ["HERO"] } },
      { text: { dialogue: ["Second part."], character_name: ["HERO"] } },
    ],
  ],
  [
    "chained action (mid-line > break)",
    `  The door creaks. > Then slams.`,
    [
      { text: { action: ["The door creaks."] } },
      { text: { action: ["Then slams."] } },
    ],
  ],
  [
    "line-end > break (block dialogue, two beats)",
    `  HERO:\n    First part. >\n    Second part.`,
    [
      { text: { dialogue: ["First part."], character_name: ["HERO"] } },
      { text: { dialogue: ["Second part."], character_name: ["HERO"] } },
    ],
  ],
  [
    "inline conditional",
    `  You feel {if 2 > 1 then "great" else "bad"} today.`,
    [{ text: { action: ["You feel great today."] } }],
  ],
  [
    "inline sequence alternator",
    `  The light {queue|"flickers"|"steadies"|"dies"} now.`,
    [{ text: { action: ["The light flickers now."] } }],
  ],
  [
    "display line with a trailing # tag",
    `  The bell rings. # ominous`,
    [{ text: { action: ["The bell rings."] } }],
  ],
  [
    "dialogue with a trailing # tag",
    `  HERO: Goodbye. # final`,
    [{ text: { dialogue: ["Goodbye."], character_name: ["HERO"] } }],
  ],
  [
    "write with no layer",
    `  @: Layerless line.\n  Next.`,
    [
      { text: { action: ["Layerless line."] } },
      { text: { action: ["Next."] } },
    ],
  ],
  [
    "empty body keeps its own step",
    `  $:\n  After the heading.`,
    [{ text: { action: ["After the heading."] } }],
  ],
  [
    "mid-line divert",
    `  We hurried home to -> row\nend\n\nscene row\n  Savile Row.`,
    [{ text: { action: ["We hurried home to Savile Row."] } }],
  ],
  [
    "mid-line load divert",
    `  We hurried home to -> load row\nend\n\nscene row\n  Savile Row.`,
    [
      { text: { action: ["We hurried home to"] } },
      { load: [{ name: "row" }] },
      { text: { action: ["Savile Row."] } },
    ],
  ],
  [
    "touching-glue continuation (.. touching the last word)",
    `  Some..\n  ..content..\n  ..with glue.`,
    [{ text: { action: ["Somecontentwith glue."] } }],
  ],
  [
    "trailing-glue continuation (.. at end of line)",
    `  Some ..\n  .. content ..\n  .. with glue.`,
    [{ text: { action: ["Some content with glue."] } }],
  ],
  [
    "glued dialogue continuation",
    `  HERO: Wait ..\n  .. right there.`,
    [{ text: { dialogue: ["Wait right there."], character_name: ["HERO"] } }],
  ],
  [
    "continuation inside an if branch",
    `  You see a ..\n  if true then\n    .. red door.\n  end`,
    [{ text: { action: ["You see a red door."] } }],
  ],
  [
    "chain of three trailing-glue dialogue lines",
    `  HERO: One ..\n  HERO: .. two ..\n  HERO: .. three.`,
    [{ text: { dialogue: ["One two three."], character_name: ["HERO"] } }],
  ],
  [
    "mid-body glue in a block dialogue",
    `  HERO:\n    First ..\n    .. second.`,
    [{ text: { dialogue: ["First second."], character_name: ["HERO"] } }],
  ],
  [
    "glued line continued by a bare {expr} line",
    `  You have ..\n  .. {1 + 2}`,
    [{ text: { action: ["You have 3"] } }],
  ],
  [
    "empty glued continuation keeps the beat open",
    `  You see ..\n  .. {if true then "" else ""} ..\n  .. The door.`,
    [{ text: { action: ["You see  The door."] } }],
  ],
  [
    "whitespace-only glued continuation keeps the beat open",
    `  First ..\n  .. {if true then " " else ""} ..\n  .. Last ..\n  .. word.`,
    [{ text: { action: ["First   Last word."] } }],
  ],
  [
    "trailing > break alone",
    `  First >\n  Last.`,
    [{ text: { action: ["First"] } }, { text: { action: ["Last."] } }],
  ],
  [
    "trailing > break the next line carries on after",
    `  First .. >\n  .. second.\n  Last.`,
    [
      { text: { action: ["First"] } },
      { text: { action: ["First second."] } },
      { text: { action: ["Last."] } },
    ],
  ],
  [
    "load directive ending with `..` joins nothing",
    `  load overworld ..\n  Underworld.\n  The world appears.`,
    [
      { load: [{ name: "overworld" }] },
      { text: { action: ["Underworld."] } },
      { text: { action: ["The world appears."] } },
    ],
  ],
  [
    "line after a glued pair is its own beat",
    `  You see a ..\n  .. red door.\n  It is locked.`,
    [
      { text: { action: ["You see a red door."] } },
      { text: { action: ["It is locked."] } },
    ],
  ],
  [
    "load directive line stays a directive",
    `  load overworld\n  The world appears.`,
    [
      { load: [{ name: "overworld" }] },
      { text: { action: ["The world appears."] } },
    ],
  ],
  [
    "load arrow",
    `  Before.\n  -> load row\nend\n\nscene row\n  Savile Row.`,
    [
      { text: { action: ["Before."] } },
      { load: [{ name: "row" }] },
      { text: { action: ["Savile Row."] } },
    ],
  ],
  [
    "single-line block alternator",
    `  queue | A # t | B end\n  After.`,
    [{ text: { action: ["A"] } }, { text: { action: ["After."] } }],
  ],
  [
    "bare {expr} line",
    `  {1 + 2}\n  After.`,
    [{ text: { action: ["3"] } }, { text: { action: ["After."] } }],
  ],
  [
    "{x}{y} chain",
    `  {1}{2}\n  After.`,
    [{ text: { action: ["12"] } }, { text: { action: ["After."] } }],
  ],
  [
    "print() call",
    `  & f()\n  After.\nend\n\nfunction f()\nprint("hi")\nprint("two")`,
    [
      { text: { action: ["hi"] } },
      { text: { action: ["two"] } },
      { text: { action: ["After."] } },
    ],
  ],
  [
    "picked choice",
    `  choose\n    * Take it\n      Taken.\n  end`,
    [
      { text: { "choice 0": ["Take it"] } },
      { text: { action: ["Take it"] } },
      { text: { action: ["Taken."] } },
    ],
  ],
  [
    "picked choice with an inline divert",
    `  choose\n    * Take it -> row\n  end\nend\n\nscene row\n  now.`,
    [
      { text: { "choice 0": ["Take it"] } },
      { text: { action: ["Take it now."] } },
    ],
  ],
  [
    "picked choice diverting into a dialogue line",
    `  choose\n    * Take it -> row\n  end\nend\n\nscene row\n  HERO: Now.`,
    [
      { text: { "choice 0": ["Take it"] } },
      { text: { dialogue: ["Take it Now."], character_name: ["HERO"] } },
    ],
  ],
  [
    "picked choice with a tag",
    `  choose\n    * Take it # picked\n      Taken.\n  end`,
    [
      { text: { "choice 0": ["Take it"] } },
      { text: { action: ["Take it"] } },
      { text: { action: ["Taken."] } },
    ],
  ],
  [
    "print() ending a function, then a dialogue line",
    `  & f()\n  HERO: After.\nend\n\nfunction f()\nprint("printed")`,
    [
      { text: { action: ["printed"] } },
      { text: { dialogue: ["After."], character_name: ["HERO"] } },
    ],
  ],
  [
    "dialogue line with a tag evaluated after its text",
    `  store x = 0\n  HERO: Say {bump()} # {x}\nend\n\nfunction bump()\nx += 1\nreturn "Hello"`,
    [{ text: { dialogue: ["Say Hello"], character_name: ["HERO"] } }],
  ],
  [
    "mid-body glue after an interpolation",
    `  HERO:\n    You have {1 + 1} ..\n    .. apples.`,
    [{ text: { dialogue: ["You have 2 apples."], character_name: ["HERO"] } }],
  ],
  [
    "mid-body glue before an interpolation",
    `  HERO:\n    Count ..\n    .. {1 + 1} apples.`,
    [{ text: { dialogue: ["Count 2 apples."], character_name: ["HERO"] } }],
  ],
  [
    "text after a mid-line divert",
    `  We go -> row and more.\nend\n\nscene row\n  Savile Row.`,
    [{ text: { action: ["We go Savile Row."] } }],
  ],
];

const IMAGE_FIXTURES: [label: string, body: string, beats: Beat[]][] = [
  [
    "action with an inline [[show]] directive",
    `  The sun rises. [[show backdrop BG]]`,
    [
      {
        text: { action: ["The sun rises. "] },
        image: { backdrop: [{ control: "show", assets: ["BG"] }] },
      },
    ],
  ],
  [
    "dialogue with an inline [[show]] directive",
    `  HERO: Look! [[show backdrop BG]]`,
    [
      {
        text: { dialogue: ["Look! "], character_name: ["HERO"] },
        image: { backdrop: [{ control: "show", assets: ["BG"] }] },
      },
    ],
  ],
  [
    "standalone asset line",
    `  [[show backdrop BG]]\n  After the asset.`,
    [
      {
        text: { action: ["After the asset."] },
        image: { backdrop: [{ control: "show", assets: ["BG"] }] },
      },
    ],
  ],
];

describe("display() renders what each script authored", () => {
  for (const [label, body, beats] of FIXTURES) {
    test(label, async () => {
      expect(await renderedBeats(story(body))).toEqual(beats);
    });
  }
});

describe("display() renders inline asset directives", () => {
  for (const [label, body, beats] of IMAGE_FIXTURES) {
    test(label, async () => {
      expect(await renderedBeats(story(body, IMAGE_SCREEN))).toEqual(beats);
    });
  }
});

// The interpreter's reading of a step, beat by beat.
async function beats(body: string) {
  const harness = createHarness(story(body));
  await harness.ready;
  harness.jumpTo("start");
  const out = [];
  for (let beat = harness.nextBeat(); beat; beat = harness.nextBeat()) {
    out.push(beat);
  }
  return out;
}

describe("display() load beats", () => {
  test("interpolated text beginning with load renders as text", async () => {
    const [beat] = await beats(`  store verb = "load"\n  {verb} the cart`);
    expect(beat!.load).toBeUndefined();
    expect(
      Object.values(beat!.text ?? {})
        .flat()
        .map((t) => t.text)
        .join(""),
    ).toContain("load the cart");
  });

  // A table naming no target renders on the default target; only a `load`
  // field makes a load beat.
  for (const [label, body] of [
    ["a layerless write", `  store verb = "load"\n  @: {verb} the cart`],
    ["a print() call", `  & f()\nend\n\nfunction f()\nprint("load the cart")`],
  ] as const) {
    test(`${label} beginning with load renders as text`, async () => {
      const [beat] = await beats(body);
      expect(beat!.load).toBeUndefined();
      expect(
        Object.values(beat!.text ?? {})
          .flat()
          .map((t) => t.text)
          .join(""),
      ).toContain("load the cart");
    });
  }

  // A divert or a picked choice holds its line open with glue, so the target's
  // `load` line reaches the same step; it still makes a beat of its own.
  for (const [label, body, pick] of [
    [
      "a mid-line divert",
      `  We hurried home to -> row\nend\n\nscene row\n  load overworld\n  Arrived.`,
      false,
    ],
    [
      "a picked choice",
      `  choose\n    * Take it -> row\n  end\nend\n\nscene row\n  load overworld\n  Arrived.`,
      true,
    ],
  ] as const) {
    test(`a load line reached through ${label} is a load beat of its own`, async () => {
      const harness = createHarness(story(body));
      await harness.ready;
      harness.jumpTo("start");
      const run = [];
      for (let guard = 0; guard < 20; guard++) {
        const beat = harness.nextBeat();
        if (beat) {
          run.push(beat);
          continue;
        }
        const s: any = harness.game.story;
        if (!pick || s.canContinue || s.currentChoices.length === 0) break;
        s.ChooseChoiceIndex(0);
      }
      // A picked choice's run opens with the beat that shows the choices.
      const shown = run.filter((b) => b.load || b.text).slice(pick ? 1 : 0);
      expect(shown.map((b) => Boolean(b.load))).toEqual([false, true, false]);
      expect(shown[1]!.load).toEqual([{ name: "overworld" }]);
    });
  }

  test("a load step split from a held line is followed by the choices' own beat", async () => {
    const run = await beats(
      `  Before -> row\nend\n\nscene row\n  load overworld\n  choose\n    * Go\n      Gone.\n  end`,
    );
    expect(run.map((b) => Boolean(b.load))).toEqual([false, true, false]);
    expect(run[1]!.load).toEqual([{ name: "overworld" }]);
    expect(
      Object.keys(run.at(-1)!.text ?? {}).some((k) => k.startsWith("choice")),
    ).toBe(true);
  });

  test("every load line that reaches one step is a load beat", async () => {
    const run = await beats(
      `  Before -> row\nend\n\nscene row\n  load overworld -> other\nend\n\nscene other\n  load underworld\n  Arrived.`,
    );
    expect(run.filter((b) => b.load).map((b) => b.load)).toEqual([
      [{ name: "overworld" }],
      [{ name: "underworld" }],
    ]);
  });

  test("a load line between two text lines is a load beat of its own", async () => {
    const run = await beats(`  Before.\n  load overworld\n  After.`);
    expect(run.map((b) => Boolean(b.load))).toEqual([false, true, false]);
    expect(run[1]!.load).toEqual([{ name: "overworld" }]);
    expect(run[1]!.text).toBeUndefined();
  });
});

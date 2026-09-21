// Parity gate for the display-as-Luau-call transport: every display statement
// the lowerer routes through `display(<table>)` (experimentalDisplayCalls ON)
// must produce a BYTE-IDENTICAL renderer message stream to the legacy
// routing-tag + visible-text path (flag OFF). This is the gate that lets us
// eventually flip the default and delete the legacy parse() path.
//
// Each fixture is driven through one beat both ways; the id-normalized ui/*
// stream must match. Where the lowerer falls back (content the table can't carry
// yet), the streams are trivially identical because both ran the legacy path —
// which is still correct parity, just not yet via display().

import { describe, expect, test } from "vitest";
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

function story(body: string) {
  return `${SCREEN}\n-> start\n\nscene start\n${body}\nend\n`;
}

async function beatStream(body: string, experimentalDisplayCalls: boolean) {
  const harness = createHarness(story(body), 0, { experimentalDisplayCalls });
  await harness.ready;
  harness.jumpTo("start");
  harness.reset();
  // Drive every beat of the scene (a chained `>` line produces several), so the
  // captured stream covers multi-beat content too. A story stopped on choices
  // takes the first one.
  for (let guard = 0; guard < 50; guard++) {
    const beat = harness.nextBeat();
    if (beat) {
      await harness.display(beat, true);
      await flushMicrotasks();
      continue;
    }
    const story: any = harness.game.story;
    if (story.canContinue || story.currentChoices.length === 0) break;
    story.ChooseChoiceIndex(0);
  }
  return harness.snapshotFiltered("ui/");
}

async function assertParity(body: string) {
  const legacy = await beatStream(body, false);
  const viaDisplay = await beatStream(body, true);
  // A fixture that stops producing beats would make both streams `[]` and the
  // equality below silently vacuous — parity between two empty runs proves
  // nothing. Every fixture here renders SOMETHING.
  expect(legacy.length).toBeGreaterThan(0);
  expect(viaDisplay).toEqual(legacy);
}

describe("display() ↔ legacy parity (message stream)", () => {
  test("plain action", async () => {
    await assertParity(`  The room is quiet.`);
  });

  test("action with interpolation", async () => {
    await assertParity(`  You have {2 + 3} apples.`);
  });

  test("action with bold + italic emphasis", async () => {
    await assertParity(`  This is **bold** and *italic* text.`);
  });

  test("action with underline + centered", async () => {
    await assertParity(`  Some _underlined_ and ^centered^ words.`);
  });

  test("dialogue line", async () => {
    await assertParity(`  HERO: Hello there.`);
  });

  test("dialogue with interpolation", async () => {
    await assertParity(`  HERO: I count {10 * 2} coins.`);
  });

  test("dialogue with parenthetical + position", async () => {
    await assertParity(`  HERO (cheerful) >: Wonderful!`);
  });

  test("title", async () => {
    await assertParity(`  ^: My Title`);
  });

  test("scene heading", async () => {
    await assertParity(`  $: INT. HOUSE - DAY`);
  });

  test("transition", async () => {
    await assertParity(`  %: CUT TO:`);
  });

  test("block dialogue (multi-line)", async () => {
    await assertParity(`  HERO:\n    First line.\n    Second line.`);
  });

  test("chained dialogue (mid-line > break)", async () => {
    await assertParity(`  HERO: First part. > Second part.`);
  });

  test("chained action (mid-line > break)", async () => {
    await assertParity(`  The door creaks. > Then slams.`);
  });

  test("line-end > break (block dialogue, two beats)", async () => {
    await assertParity(`  HERO:\n    First part. >\n    Second part.`);
  });

  test("inline conditional", async () => {
    await assertParity(`  You feel {if 2 > 1 then "great" else "bad"} today.`);
  });

  test("inline sequence alternator", async () => {
    await assertParity(`  The light {queue|"flickers"|"steadies"|"dies"} now.`);
  });

  // A `# tag` goes to the stream ahead of the line's call.
  test("display line with a trailing # tag", async () => {
    await assertParity(`  The bell rings. # ominous`);
  });

  test("dialogue with a trailing # tag", async () => {
    await assertParity(`  HERO: Goodbye. # final`);
  });

  test("write with no layer", async () => {
    await assertParity(`  @: Layerless line.\n  Next.`);
  });

  test("empty body keeps its own step", async () => {
    await assertParity(`  $:\n  After the heading.`);
  });

  // The target's first line joins the diverting line in one beat.
  test("mid-line divert", async () => {
    await assertParity(
      `  We hurried home to -> row\nend\n\nscene row\n  Savile Row.`,
    );
  });

  test("mid-line load divert", async () => {
    await assertParity(
      `  We hurried home to -> load row\nend\n\nscene row\n  Savile Row.`,
    );
  });

  // Every line of a glue chain lowers to its own display() call (pinned by
  // `glueJoin.test.ts` in packages/sparkdown); one step carries the tables and
  // the interpreter joins them into one beat routed by the first table that
  // names a target.
  test("leading-glue continuation (.. on the next line)", async () => {
    await assertParity(`  Some\n  .. content\n  .. with glue.`);
  });

  test("trailing-glue continuation (.. at end of line)", async () => {
    await assertParity(`  Some ..\n  content ..\n  with glue.`);
  });

  test("glued dialogue continuation", async () => {
    await assertParity(`  HERO: Wait ..\n  .. for me.`);
  });

  test("continuation inside an if branch", async () => {
    await assertParity(`  You see a\n  if true then\n    .. red door.\n  end`);
  });

  test("chain of three trailing-glue dialogue lines", async () => {
    await assertParity(`  HERO: One ..\n  HERO: two ..\n  HERO: three.`);
  });

  test("mid-body glue in a block dialogue", async () => {
    await assertParity(`  HERO:\n    First ..\n    second.`);
  });

  // The continuation reaches the stream as flat text, so the step holds a
  // table and a string.
  test("glued line continued by a bare {expr} line", async () => {
    await assertParity(`  You have ..\n  {1 + 2}`);
  });

  // A continuation with no visible words leaves the glue pending, so the next
  // visible line still joins the same beat.
  test("empty glued continuation keeps the beat open", async () => {
    await assertParity(
      `  You see\n  .. {if true then "" else ""}\n  The door.`,
    );
  });

  test("whitespace-only glued continuation keeps the beat open", async () => {
    await assertParity(
      `  First\n  .. {if true then " " else ""}\n  Last ..\n  word.`,
    );
  });

  test("trailing > break alone", async () => {
    await assertParity(`  First >\n  Last.`);
  });

  test("trailing > break followed by a glued line", async () => {
    await assertParity(`  First >\n  .. second.\n  Last.`);
  });

  // The `load` line's table and its glued continuation's table share a step,
  // which queues one load beat naming both worlds.
  test("load directive with a trailing-glue continuation", async () => {
    await assertParity(
      `  load overworld ..\n  underworld\n  The world appears.`,
    );
  });

  test("load directive with a leading-glue continuation", async () => {
    await assertParity(
      `  load overworld\n  .. underworld\n  The world appears.`,
    );
  });

  test("line after a glued pair is its own beat", async () => {
    await assertParity(`  You see a ..\n  red door.\n  It is locked.`);
  });

  // Paired with a text line so the streams are non-empty either way; a load
  // table rendered as text would surface as an extra "load overworld" beat.
  test("load directive line stays a directive", async () => {
    await assertParity(`  load overworld\n  The world appears.`);
  });
});

describe("display() ↔ legacy parity · producers outside display statements", () => {
  test("load arrow", async () => {
    await assertParity(`  Before.\n  -> load row\nend\n\nscene row\n  Savile Row.`);
  });

  test("single-line block alternator", async () => {
    await assertParity(`  queue | A # t | B end\n  After.`);
  });

  test("bare {expr} line", async () => {
    await assertParity(`  {1 + 2}\n  After.`);
  });

  test("{x}{y} chain", async () => {
    await assertParity(`  {1}{2}\n  After.`);
  });

  test("print() call", async () => {
    await assertParity(
      `  & f()\n  After.\nend\n\nfunction f()\nprint("hi")\nprint("two")`,
    );
  });

  test("picked choice", async () => {
    await assertParity(`  choose\n    * Take it\n      Taken.\n  end`);
  });

  test("picked choice with an inline divert", async () => {
    await assertParity(
      `  choose\n    * Take it -> row\n  end\nend\n\nscene row\n  now.`,
    );
  });

  // The echo's table names no target, so the beat takes its routing from the
  // dialogue line it joins.
  test("picked choice diverting into a dialogue line", async () => {
    await assertParity(
      `  choose\n    * Take it -> row\n  end\nend\n\nscene row\n  HERO: Now.`,
    );
  });

  test("picked choice with a tag", async () => {
    await assertParity(`  choose\n    * Take it # picked\n      Taken.\n  end`);
  });

  test("print() ending a function glued onto a dialogue line", async () => {
    await assertParity(
      `  & f()\n  HERO: After.\nend\n\nfunction f()\nprint("printed")`,
    );
  });

  test("dialogue line with a tag evaluated after its text", async () => {
    await assertParity(
      `  store x = 0\n  HERO: Say {bump()} # {x}\nend\n\nfunction bump()\nx += 1\nreturn "Hello"`,
    );
  });
});

// The interpreter's reading of a step, beat by beat.
async function beats(body: string, experimentalDisplayCalls: boolean) {
  const harness = createHarness(story(body), 0, { experimentalDisplayCalls });
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
    const [beat] = await beats(
      `  store verb = "load"\n  {verb} the cart`,
      true,
    );
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
    [
      "a print() call",
      `  & f()\nend\n\nfunction f()\nprint("load the cart")`,
    ],
  ] as const) {
    test(`${label} beginning with load renders as text`, async () => {
      const [beat] = await beats(body, true);
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
      const harness = createHarness(story(body), 0, {
        experimentalDisplayCalls: true,
      });
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

  test("a load step split from a held line keeps the step's choices", async () => {
    const run = await beats(
      `  Before -> row\nend\n\nscene row\n  load overworld\n  choose\n    * Go\n      Gone.\n  end`,
      true,
    );
    expect(run.map((b) => Boolean(b.load))).toEqual([false, true]);
    expect(run[1]!.load).toEqual([{ name: "overworld" }]);
    expect(
      Object.keys(run.at(-1)!.text ?? {}).some((k) => k.startsWith("choice")),
    ).toBe(true);
  });

  test("every load line that reaches one step is a load beat", async () => {
    const run = await beats(
      `  Before -> row\nend\n\nscene row\n  load overworld -> other\nend\n\nscene other\n  load underworld\n  Arrived.`,
      true,
    );
    expect(run.filter((b) => b.load).map((b) => b.load)).toEqual([
      [{ name: "overworld" }],
      [{ name: "underworld" }],
    ]);
  });

  test("a load line between two text lines is a load beat of its own", async () => {
    const run = await beats(`  Before.\n  load overworld\n  After.`, true);
    expect(run.map((b) => Boolean(b.load))).toEqual([false, true, false]);
    expect(run[1]!.load).toEqual([{ name: "overworld" }]);
    expect(run[1]!.text).toBeUndefined();
  });
});

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

function imageStory(body: string) {
  return `${IMAGE_SCREEN}\n-> start\n\nscene start\n${body}\nend\n`;
}

async function imageBeatStream(body: string, flag: boolean) {
  const harness = createHarness(imageStory(body), 0, {
    experimentalDisplayCalls: flag,
  });
  await harness.ready;
  harness.jumpTo("start");
  harness.reset();
  let beat = harness.nextBeat();
  while (beat) {
    await harness.display(beat, true);
    await flushMicrotasks();
    beat = harness.nextBeat();
  }
  return harness.snapshotFiltered("ui/");
}

async function assertImageParity(body: string) {
  const legacy = await imageBeatStream(body, false);
  const viaDisplay = await imageBeatStream(body, true);
  expect(viaDisplay).toEqual(legacy);
}

describe("display() ↔ legacy parity · inline asset directives", () => {
  test("action with an inline [[show]] directive", async () => {
    await assertImageParity(`  The sun rises. [[show backdrop BG]]`);
  });

  test("dialogue with an inline [[show]] directive", async () => {
    await assertImageParity(`  HERO: Look! [[show backdrop BG]]`);
  });

  test("standalone asset line", async () => {
    await assertImageParity(`  [[show backdrop BG]]\n  After the asset.`);
  });
});

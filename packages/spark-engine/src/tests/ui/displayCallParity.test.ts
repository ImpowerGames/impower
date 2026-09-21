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
  // captured stream covers multi-beat content too.
  let beat = harness.nextBeat();
  while (beat) {
    await harness.display(beat, true);
    await flushMicrotasks();
    beat = harness.nextBeat();
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

  // These exercise the FALLBACK boundary: content the display() table doesn't
  // carry yet must still render identically (because the lowerer falls back to
  // the legacy path). Parity here proves "no regression", not display() usage.
  test("display line with a trailing # tag (fallback)", async () => {
    await assertParity(`  The bell rings. # ominous`);
  });

  test("dialogue with a trailing # tag (fallback)", async () => {
    await assertParity(`  HERO: Goodbye. # final`);
  });

  // Every line of a glue chain lowers to its own display() call (pinned by
  // `glueJoin.test.ts` in packages/sparkdown); one step carries the tables and
  // the interpreter joins them into one beat routed by the first table.
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

  // The `load` line stays flat text, and its glued continuation is a table:
  // the step still has to queue a load beat.
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

  // `load <name>` is a world-load directive `InterpreterModule.queue`
  // intercepts by prefix; `queueInstructions` has no such interception, so the
  // lowerer must keep it on the legacy path or it renders as literal text.
  test("load directive line stays a directive (fallback)", async () => {
    // Paired with a text line so the streams are non-empty either way; if the
    // directive leaked onto the display path it would surface here as an
    // extra rendered "load overworld" beat in the flag-on stream.
    await assertParity(`  load overworld\n  The world appears.`);
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
});

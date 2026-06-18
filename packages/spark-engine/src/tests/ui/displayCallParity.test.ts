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

screen main with
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
});

const IMAGE_SCREEN = `define HERO as character with
  name = "HERO"
end

define BG as image with
  src = "https://example.com/bg.png"
end

screen main with
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

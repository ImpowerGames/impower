// Golden-master: the non-dialogue text targets — title, scene-heading,
// transition, action — plus multi-line / whitespace / text-align wrapping and
// the `wavy` / `shaky` inline animations.
//
// Authors reach these targets via directive prefixes (`^:` title, `$:` scene
// heading, `%:` transition, bare = action). Each routes through the same
// per-glyph typewriter realization as dialogue but with target-specific
// typewriter timing — the stream locks both routing and decomposition.

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SCREEN = `screen main with
  title:
    text
  heading:
    text
  transitional:
    text
  action:
    text
end
`;

async function beatFor(body: string, instant = true) {
  const harness = createHarness(`${SCREEN}\n-> start\n\nscene start\n${body}\nend\n`);
  await harness.ready;
  harness.jumpTo("start");
  harness.reset();
  const beat = harness.nextBeat();
  await harness.display(beat!, instant);
  await flushMicrotasks();
  return { harness, beat };
}

describe("text targets", () => {
  test("title (^:)", async () => {
    const { harness, beat } = await beatFor(`  ^: My Title`);
    expect(Object.keys(beat?.text ?? {})).toEqual(["title"]);
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("scene heading ($:)", async () => {
    const { harness, beat } = await beatFor(`  $: INT. HOUSE - DAY`);
    expect(Object.keys(beat?.text ?? {})).toEqual(["heading"]);
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("transition (%:)", async () => {
    const { harness, beat } = await beatFor(`  %: CUT TO:`);
    expect(Object.keys(beat?.text ?? {})).toEqual(["transitional"]);
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("action (default target)", async () => {
    const { harness, beat } = await beatFor(`  The room is quiet.`);
    expect(Object.keys(beat?.text ?? {})).toEqual(["action"]);
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("multi-line action with whitespace + text-align wrapping", async () => {
    const { harness } = await beatFor(
      `  First line here.\n  ^Centered middle.^\n  Last line.`,
    );
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("inline wavy / shaky animations", async () => {
    const { harness } = await beatFor(`  This is ~~wavy~~ and ::shaky:: text.`);
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("inline color via underline / centered styling", async () => {
    const { harness } = await beatFor(`  Some _underlined_ words.`);
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });
});

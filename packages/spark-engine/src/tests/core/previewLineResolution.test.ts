// Jumping the preview to a line must display THAT line's beat.
//
// A display beat's recorded source range ends where the next statement begins,
// which is column 0 of the following content line. `findClosestPathLocation`
// matches a line against `startLine..endLine` without looking at the columns, so
// a range that merely touches the start of the next content line used to swallow
// it: clicking the action line after a dialogue block resolved to the DIALOGUE's
// path, and the preview faithfully displayed the dialogue. The compiler now
// pulls such a range back to the end of the previous line, so every content line
// resolves to its own beat.
//
// Driven through the production scrub path: an UNCONNECTED game plans and
// replays the route (what `workspace.worker` does) and its checkpoint is loaded
// into a fresh CONNECTED game that previews the point (what the player does).

import { describe, expect, test } from "vitest";
import { createHarness, MAIN_URI } from "../ui/harness/uiTestHarness";

// The reproduction from issue #490, verbatim: an action line one blank line
// below a dialogue block.
const SOURCE = `RAFFLES:
  Wow.

With an indignant pivot, Raffles glides briskly ahead.

BUNNY:
  Okay, okay!
`;

const lineOf = (needle: string): number => {
  const line = SOURCE.split("\n").findIndex((l) => l.includes(needle));
  if (line < 0) {
    throw new Error(`fixture has no line containing ${JSON.stringify(needle)}`);
  }
  return line;
};

/** Every character the engine wrote to the screen, across all targets. */
const writtenText = (harness: any): string =>
  harness
    .snapshotFiltered("ui/write-text")
    .map((m: any) =>
      (m?.params?.instructions ?? []).map((i: any) => i.text ?? "").join(""),
    )
    .join(" ");

/** Scrub to `line` the way the editor does, and return what got written. */
async function scrubTo(line: number): Promise<{ path: string | null; text: string }> {
  const simulator = createHarness(SOURCE, 0, { connect: false });
  const simulated: any = simulator.game;
  simulated.setStartFrom({ file: MAIN_URI, line });
  simulated.simulate();
  expect(simulated.simulation).toBe("success");
  const checkpoint = simulated.save();

  const player = createHarness(SOURCE, line, { loadCheckpoint: checkpoint });
  await player.ready;
  player.reset();
  const path = await player.preview(line);
  return { path, text: writtenText(player) };
}

describe("preview point resolution (#490)", () => {
  test("an action line after a dialogue block displays its own text", async () => {
    const { text } = await scrubTo(lineOf("indignant"));
    expect(text).toContain("With an indignant pivot, Raffles glides briskly ahead.");
    expect(text).not.toContain("Wow.");
  });

  test("the dialogue line above it still displays the dialogue", async () => {
    // Positive control: the fix narrows the dialogue beat's range, so this is
    // the assertion that would break if it were narrowed too far.
    const { text } = await scrubTo(lineOf("Wow."));
    expect(text).toContain("Wow.");
    expect(text).toContain("RAFFLES");
    expect(text).not.toContain("indignant");
  });

  test("each content line resolves to a different beat", async () => {
    const dialogue = await scrubTo(lineOf("Wow."));
    const action = await scrubTo(lineOf("indignant"));
    expect(dialogue.path).toBeTruthy();
    expect(action.path).toBeTruthy();
    expect(action.path).not.toBe(dialogue.path);
  });
});

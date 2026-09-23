// What the worker keeps to display the preview from its own game (#680) is
// bounded: however many suggestions an author browses, it keeps the stories
// of the real program, the two newest suggestions, the one the page shows and
// the one it displayed last, and lets every other go, so nothing it holds for
// them grows with the browsing.
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI } from "./playerHarness";

const TEXT = [
  "define hero as character:",
  `  name = "Hero"`,
  "",
  ...Array.from({ length: 6 }, (_, s) => [
    `scene scene_${s}`,
    `= INT. ROOM ${s} - DAY`,
    ":",
    `  Action describing room ${s}.`,
    "hero:",
    `  Line one of dialogue in scene ${s}.`,
    `-> scene_${(s + 1) % 6}`,
    "end",
    "",
  ]).flat(),
].join("\n");

const LINE = TEXT.split("\n").indexOf("  Line one of dialogue in scene 3.");

describe("the stories the worker keeps", () => {
  it("stay bounded across 150 highlighted suggestions", async () => {
    const h = await createPlayerHarness({
      workerDisplays: true,
      files: [{ uri: MAIN_URI, text: TEXT }],
      startFrom: { file: MAIN_URI, line: LINE },
      recordMessages: false,
    });
    try {
      await h.compile();
      await h.select(LINE);
      const journal = (h.workerState.compilerState.compiler as any)._storyJournal;
      const recorded = () => {
        let entries = 0;
        for (const table of journal._tables.values()) entries += table.entries.size;
        return entries;
      };
      const lineText = TEXT.split("\n")[LINE]!;
      // Run with `--expose-gc` to also print the process's heap around the
      // browsing; the assertions below do not depend on it.
      const gc = (globalThis as any).gc as (() => void) | undefined;
      const heapMB = () => {
        gc?.();
        gc?.();
        return Math.round((process.memoryUsage().heapUsed / 1048576) * 10) / 10;
      };
      const heapBefore = gc ? heapMB() : undefined;
      const heapRounds: number[] = [];
      const counts: number[] = [];
      const recordedCounts: number[] = [];
      for (let n = 0; n < 150; n++) {
        await h.suggest(
          [
            {
              range: { start: { line: LINE, character: 2 }, end: { line: LINE, character: lineText.length } },
              text: `Suggestion number ${n % 10} for scene 3.`,
            },
          ],
          LINE,
        );
        if (n % 10 === 9) {
          await h.closeSuggestions();
          counts.push(journal._tables.size);
          recordedCounts.push(recorded());
          if (gc) heapRounds.push(heapMB());
        }
      }
      if (heapBefore !== undefined) {
        process.stderr.write(
          `heap before ${heapBefore} MB, after each round of 10 suggestions ${JSON.stringify(heapRounds)} MB; stories kept per round ${JSON.stringify(counts)}; entries recorded per round ${JSON.stringify(recordedCounts)}\n`,
        );
      }
      expect(h.overlay.textContent).toContain("Line one of dialogue in scene 3.");
      // The newest story, the canonical one, and at most the four suggestions
      // the worker can be asked for again.
      expect(Math.max(...counts)).toBeLessThanOrEqual(6);
      // And what they record does not grow round after round: an entry for an
      // object no kept story holds would keep a discarded story alive.
      expect(recordedCounts.at(-1)).toBeLessThanOrEqual(Math.max(...recordedCounts.slice(0, 3)));
    } finally {
      h.dispose();
    }
  }, 600_000);

  it("stay bounded while the author edits with a suggestion on screen", async () => {
    // The page takes each real program without displaying it while a
    // suggestion holds the screen, and PLAY can name any of them; the worker
    // keeps the one the page says it holds and those compiled after it, not
    // every one compiled since the page last displayed a real program.
    const h = await createPlayerHarness({
      workerDisplays: true,
      files: [{ uri: MAIN_URI, text: TEXT }],
      startFrom: { file: MAIN_URI, line: LINE },
      recordMessages: false,
    });
    try {
      await h.compile();
      await h.select(LINE);
      const journal = (h.workerState.compilerState.compiler as any)._storyJournal;
      const lines = TEXT.split("\n");
      const lineText = lines[LINE]!;
      const ACTION = lines.indexOf("  Action describing room 3.");
      let action = lines[ACTION]!;
      const counts: number[] = [];
      for (let n = 0; n < 6; n++) {
        await h.suggest(
          [
            {
              range: { start: { line: LINE, character: 2 }, end: { line: LINE, character: lineText.length } },
              text: `Suggestion number ${n} for scene 3.`,
            },
          ],
          LINE,
        );
        const edited = `  Action describing room 3, take ${n}.`;
        await h.edit([
          {
            range: { start: { line: ACTION, character: 0 }, end: { line: ACTION, character: action.length } },
            text: edited,
          },
        ]);
        action = edited;
        await h.compile();
        counts.push(journal._tables.size);
      }
      expect(counts.at(-1)).toBeLessThanOrEqual(counts[1]!);
    } finally {
      h.dispose();
    }
  }, 300_000);
});

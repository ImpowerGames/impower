// What the worker keeps to display the preview from its own game (#680) is
// bounded: however many suggestions an author browses and however long they
// edit, it keeps the stories of the real programs the page can still name, the
// two newest suggestions, the one the page shows, the one it displayed last,
// the one a display under way asks for and the one its game holds, and lets
// every other go as soon as nothing keeps it, so nothing it holds grows with
// the browsing or the editing.
import type { CompiledProgramParams } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { CompileProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import { describe, expect, it } from "vitest";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { programIdentity } from "../../utils/programIdentity";
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
const ACTION = TEXT.split("\n").indexOf("  Action describing room 3.");

type Harness = Awaited<ReturnType<typeof createPlayerHarness>>;

const harness = () =>
  createPlayerHarness({
    workerDisplays: true,
    files: [{ uri: MAIN_URI, text: TEXT }],
    startFrom: { file: MAIN_URI, line: LINE },
    recordMessages: false,
  });

/** The story of each real program the worker compiles, in order, and the
 *  journal that keeps them. */
const recordStories = (h: Harness) => {
  const compiler = h.workerState.compilerState.compiler as any;
  const stories: object[] = [];
  compiler.addEventListener("compiler/didCompile", (params: any) => {
    if (params.story) {
      stories.push(params.story);
    }
  });
  const journal = compiler._storyJournal;
  return { stories, kept: () => stories.map((story) => journal.isKept(story)) };
};

/** Rewrites the action of scene 3, differently each time. */
const actionEditor = (h: Harness) => {
  let action = TEXT.split("\n")[ACTION]!;
  return async (n: number) => {
    const edited = `  Action describing room 3, take ${n}.`;
    await h.edit([
      {
        range: { start: { line: ACTION, character: 0 }, end: { line: ACTION, character: action.length } },
        text: edited,
      },
    ]);
    action = edited;
  };
};

/** A compile the page does not take. */
const compileAhead = (h: Harness) =>
  h.page.sendRequest(CompileProgramMessage.type, {
    textDocument: { uri: MAIN_URI },
    startFrom: { file: MAIN_URI, line: LINE },
  });

const suggestLine = (h: Harness, text: string) =>
  h.suggest(
    [
      {
        range: {
          start: { line: LINE, character: 2 },
          end: { line: LINE, character: TEXT.split("\n")[LINE]!.length },
        },
        text,
      },
    ],
    LINE,
  );

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

  it("stay bounded while the author edits with one suggestion held on screen", async () => {
    // The page takes each real program without displaying it while the
    // suggestion holds the screen, and asks for no other display.
    const h = await harness();
    try {
      const { kept } = recordStories(h);
      await h.compile();
      await h.select(LINE);
      await suggestLine(h, "A suggestion for scene 3.");
      const edit = actionEditor(h);
      for (let n = 0; n < 6; n++) {
        await edit(n);
        await h.compile();
      }
      expect(h.overlay.textContent).toContain("A suggestion for scene 3.");
      await h.held();
      // The real program the page holds, and none it held before.
      expect(kept()).toEqual([false, false, false, false, false, false, true]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("stay bounded while the author edits during PLAY", async () => {
    // The page takes each real program while PLAY runs without displaying
    // it, and restarts the game only once the compiles pause.
    const h = await harness();
    try {
      const { kept } = recordStories(h);
      await h.compile();
      await h.select(LINE);
      expect(await h.controller.startGameAndApp()).toBe(true);
      // Each compile arrives before the restart the one before it scheduled.
      h.controller.scheduleRestartGame = () => {};
      const edit = actionEditor(h);
      for (let n = 0; n < 6; n++) {
        await edit(n);
        await h.compile();
      }
      expect(h.playing()?.state).toBe("running");
      await h.held();
      // The program displayed last, and the one the page holds.
      expect(kept()).toEqual([true, false, false, false, false, false, true]);
      await h.controller.destroyGameAndApp();
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("let go of the real programs the page skipped once it displays a newer one", async () => {
    // Summaries that reach the page while it displays another are conflated:
    // it takes the newest and never names those between.
    const h = await harness();
    try {
      const { kept } = recordStories(h);
      await h.compile();
      await h.select(LINE);
      const edit = actionEditor(h);
      for (let n = 0; n < 2; n++) {
        await edit(n);
        await compileAhead(h);
      }
      await edit(2);
      await h.compile();
      // With no compile after it, the display leaves only the program it
      // shows.
      expect(kept()).toEqual([false, false, false, true]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("keep the program a display asks for while the page takes a newer one", async () => {
    // A display can still be ahead in the worker when the page takes a newer
    // program without displaying it.
    const h = await harness();
    try {
      await h.compile();
      await h.select(LINE);
      const held = programIdentity(h.controller._program)!;
      // A suggestion is displayed last, so only the display asks for the
      // real program.
      await suggestLine(h, "A suggestion for scene 3.");
      await actionEditor(h)(0);
      const newer = await compileAhead(h);
      const display = h.link.request(DisplayPreviewMessage.type, {
        program: held,
        file: MAIN_URI,
        line: LINE,
        speculative: false,
        real: held,
      });
      h.workspace.programHeld(programIdentity(newer.program)!);
      // Nothing on the route or at the line raises anything.
      expect(await display).toEqual({ displayed: true, errors: [] });
    } finally {
      h.dispose();
    }
  }, 120_000);

  /** PLAY takes the program the page holds while a newer compile is ahead of
   *  it, so the worker's game holds an older program than the newest, and
   *  the page takes the newer one while PLAY runs. */
  const playBehindCompile = async (h: Harness, kept: () => boolean[]) => {
    await h.compile();
    await h.select(LINE);
    await suggestLine(h, "A suggestion for scene 3.");
    await actionEditor(h)(0);
    const compiled = compileAhead(h);
    const started = h.controller.startGameAndApp();
    const newer: CompiledProgramParams = await compiled;
    expect(await started).toBe(true);
    h.controller.scheduleRestartGame = () => {};
    newer.program.version = 1000;
    await h.controller.loadProgram(
      newer.program,
      newer.checkpoint,
      newer.simulationFailure,
      newer.simulatedPath,
      newer.simulatedProgramId,
    );
    await h.held();
    // The page can no longer name the older program, but the worker's game
    // still holds it.
    expect(kept()).toEqual([true, true]);
  };

  it("keep the program the worker's game holds until PLAY gives it another", async () => {
    const h = await harness();
    try {
      const { kept } = recordStories(h);
      await playBehindCompile(h, kept);
      await h.controller.restartGame();
      expect(h.playing()?.state).toBe("running");
      expect(kept()).toEqual([false, true]);
      await h.controller.destroyGameAndApp();
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("keep the program the worker's game holds until a selection gives it another", async () => {
    const h = await harness();
    try {
      const { kept } = recordStories(h);
      await playBehindCompile(h, kept);
      // A selection while PLAY runs in the worker leaves the game that
      // previews as it is (#682), and the one after STOP gives it the real
      // program back.
      await h.select(LINE);
      expect(kept()).toEqual([true, true]);
      await h.controller.destroyGameAndApp();
      await h.select(LINE);
      expect(kept()).toEqual([false, true]);
    } finally {
      h.dispose();
    }
  }, 120_000);
});

import type { CompiledProgramParams } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { CompileProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import { describe, expect, it } from "vitest";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { programIdentity } from "../../utils/programIdentity";
import { createPlayerHarness, MAIN_URI } from "./playerHarness";

const TEXT = [
  "define hero as character with",
  `  name = "Hero"`,
  "end",
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
    files: [{ uri: MAIN_URI, text: TEXT }],
    startFrom: { file: MAIN_URI, line: LINE },
    recordMessages: false,
  });

const recordPrograms = (h: Harness) => {
  const compiler = h.workerState.compilerState.compiler as any;
  const ids: string[] = [];
  compiler.addEventListener("compiler/didCompile", (params: any) => {
    if (params.produced) {
      ids.push(programIdentity(params.program)!);
    }
  });
  const keptIds = () => h.workerState.player.keptPrograms();
  return { ids, kept: () => ids.map((id) => keptIds().includes(id)) };
};

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

describe("the programs the worker keeps", () => {
  it("stay bounded across 150 highlighted suggestions", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: TEXT }],
      startFrom: { file: MAIN_URI, line: LINE },
      recordMessages: false,
    });
    try {
      await h.compile();
      await h.select(LINE);
      const lineText = TEXT.split("\n")[LINE]!;
      const gc = (globalThis as any).gc as (() => void) | undefined;
      const heapMB = () => {
        gc?.();
        gc?.();
        return Math.round((process.memoryUsage().heapUsed / 1048576) * 10) / 10;
      };
      const heapBefore = gc ? heapMB() : undefined;
      const heapRounds: number[] = [];
      const counts: number[] = [];
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
          counts.push(h.workerState.player.keptPrograms().length);
          if (gc) heapRounds.push(heapMB());
        }
      }
      if (heapBefore !== undefined) {
        process.stderr.write(
          `heap before ${heapBefore} MB, after each round of 10 suggestions ${JSON.stringify(heapRounds)} MB; programs kept per round ${JSON.stringify(counts)}\n`,
        );
      }
      expect(h.overlay.textContent).toContain("Line one of dialogue in scene 3.");
      expect(Math.max(...counts)).toBeLessThanOrEqual(6);
    } finally {
      h.dispose();
    }
  }, 600_000);

  it("stay bounded while the author edits with a suggestion on screen", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: TEXT }],
      startFrom: { file: MAIN_URI, line: LINE },
      recordMessages: false,
    });
    try {
      await h.compile();
      await h.select(LINE);
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
        counts.push(h.workerState.player.keptPrograms().length);
      }
      expect(counts.at(-1)).toBeLessThanOrEqual(counts[1]!);
    } finally {
      h.dispose();
    }
  }, 300_000);

  it("stay bounded while the author edits with one suggestion held on screen", async () => {
    const h = await harness();
    try {
      const { kept } = recordPrograms(h);
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
      expect(kept()).toEqual([false, false, false, false, false, false, true]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("stay bounded while the author edits during PLAY", async () => {
    const h = await harness();
    try {
      const { kept } = recordPrograms(h);
      await h.compile();
      await h.select(LINE);
      expect(await h.controller.startGameAndApp()).toBe(true);
      h.controller.scheduleRestartGame = () => {};
      const edit = actionEditor(h);
      for (let n = 0; n < 6; n++) {
        await edit(n);
        await h.compile();
      }
      expect(h.playing()?.state).toBe("running");
      await h.held();
      expect(kept()).toEqual([true, false, false, false, false, false, true]);
      await h.controller.destroyGameAndApp();
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("let go of the real programs the page skipped once it displays a newer one", async () => {
    const h = await harness();
    try {
      const { kept } = recordPrograms(h);
      await h.compile();
      await h.select(LINE);
      const edit = actionEditor(h);
      for (let n = 0; n < 2; n++) {
        await edit(n);
        await compileAhead(h);
      }
      await edit(2);
      await h.compile();
      expect(kept()).toEqual([false, false, false, true]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("keep the program a display asks for while the page takes a newer one", async () => {
    const h = await harness();
    try {
      await h.compile();
      await h.select(LINE);
      const held = programIdentity(h.controller._program)!;
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
      expect(await display).toMatchObject({ displayed: true, errors: [] });
    } finally {
      h.dispose();
    }
  }, 120_000);

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
      newer.simulatedAddress,
      newer.simulatedProgramId,
    );
    await h.held();
    expect(kept()).toEqual([true, true]);
  };

  it("keep the program the worker's game holds until PLAY gives it another", async () => {
    const h = await harness();
    try {
      const { kept } = recordPrograms(h);
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
      const { kept } = recordPrograms(h);
      await playBehindCompile(h, kept);
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

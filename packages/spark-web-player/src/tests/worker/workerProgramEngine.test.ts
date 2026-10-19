// The player's worker compiles statement chunks and runs them on the program
// engine (#703), for the preview's game and for PLAY's. A live edit that
// holds a construct the program cannot compile (an `external` declaration)
// is reported as an error at its line and makes no program; the next edit
// that removes it makes one again, with the beat at the cursor on screen
// throughout.
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { unsupportedConstructMessage } from "@impower/sparkdown/src/compiler/utils/unsupportedConstructMessage";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `-> start

scene start
  HERO:
    The first line.

  HERO:
    The second line.
end
`;

const SECOND = SOURCE.split("\n").findIndex((l) => l.includes("The second line."));
const END = SOURCE.split("\n").length - 1;
const EXTERNAL = "external message(x)\n";

/** STOP waits a frame between its steps, which this page does not draw. */
const framesForStop = (h: { overlay: HTMLElement }) => {
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
};

// A scene with music, a menu on the way to its end and a second scene, for
// the frames the engine shows.
const SCENES = `define theme as audio with
  src = "https://example.com/theme.wav"
end

-> start

scene start
  ((play music theme))
  HERO:
    The first line.

  HERO:
    The second line.

  choose
    * Go left
      Went left.
    * Go right
      Went right.
  end
  The end of the scene.
end

scene other
  OTHER:
    Another scene's line.
end
`;

const lineIn = (text: string, find: string) =>
  text.split("\n").findIndex((l) => l.includes(find));

/** What the author sees and hears at each step: a selection, a highlighted
 *  suggestion, a typed edit, a scrub to the other scene and to a line past a
 *  menu, and PLAY from the previewed line with a save made while it runs.
 *  Each frame is the overlay and the sound the page was told to make since
 *  the step before. */
async function authorSteps() {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SCENES }],
    startFrom: { file: MAIN_URI, line: lineIn(SCENES, "The second line.") },
    manualClock: true,
  });
  framesForStop(h);
  const frames: { step: string; overlay: unknown; sound: string[] }[] = [];
  let heard = 0;
  const frame = (step: string) => {
    // Loading a sound into a player, or a control timeline with something on
    // it; an empty update (the typewriter's, after each display) is silent.
    const sound = h.toPage
      .slice(heard)
      .filter(
        (m) =>
          m?.method === "audio/load" ||
          (m?.method === "audio/update" && m.params?.updates?.length !== 0),
      )
      .map((m) => `${m.method} ${JSON.stringify(m.params)}`);
    heard = h.toPage.length;
    frames.push({ step, overlay: h.snapshotDOM(), sound });
  };
  try {
    await h.compile();
    await h.select(lineIn(SCENES, "The second line."));
    frame("select");
    const second = lineIn(SCENES, "The second line.");
    await h.suggest(
      [
        {
          range: { start: { line: second, character: 4 }, end: { line: second, character: 20 } },
          text: "The suggested line.",
        },
      ],
      second,
    );
    frame("suggest");
    await h.closeSuggestions();
    frame("close");
    // An edit on another line, then one inside the beat on screen.
    const first = lineIn(SCENES, "The first line.");
    await h.edit([
      {
        range: { start: { line: first, character: 4 }, end: { line: first, character: 19 } },
        text: "The first line, edited.",
      },
    ]);
    await h.compile();
    frame("edit another line");
    await h.edit([
      {
        range: { start: { line: second, character: 19 }, end: { line: second, character: 20 } },
        text: ", edited.",
      },
    ]);
    await h.compile();
    frame("edit the beat on screen");
    await h.select(lineIn(SCENES, "Another scene's line."));
    frame("scrub to the other scene");
    await h.select(lineIn(SCENES, "The end of the scene."));
    frame("scrub past the menu");
    await h.select(second);
    frame("scrub back");
    expect(await h.controller.startGameAndApp()).toBe(true);
    await settle(40);
    await h.tick(1000 / 60, 120);
    frame("play");
    // A save made during PLAY, then the game run on past it, then the save
    // loaded: the game is back where the save was made.
    const running = h.playing()!;
    const save = running.save();
    running.clickedToContinue();
    await h.tick(1000 / 60, 120);
    const movedOn = running.save() !== save;
    const loaded = running.load(save) && running.save() === save;
    await h.controller.stopGame("quit");
    await settle(40);
    frame("stop");
    return { frames, loaded, movedOn, engine: running.story as unknown };
  } finally {
    h.dispose();
  }
}

describe("the frames the author sees", () => {
  it("show each step's beat on the program engine, and a preview update makes no sound", async () => {
    const on = await authorSteps();
    // A boolean, not the engine: a failing assertion would print a story.
    expect(on.engine instanceof ProgramStory).toBe(true);
    const shown = (step: string, text: string) =>
      JSON.stringify(on.frames.find((f) => f.step === step)?.overlay).includes(text);
    expect(shown("select", "The second line.")).toBe(true);
    expect(shown("suggest", "The suggested line.")).toBe(true);
    expect(shown("edit another line", "The second line.")).toBe(true);
    expect(shown("edit the beat on screen", "The second line, edited.")).toBe(true);
    expect(shown("scrub to the other scene", "Another scene")).toBe(true);
    expect(shown("scrub past the menu", "The end of the scene.")).toBe(true);
    expect(shown("play", "The second line, edited.")).toBe(true);
    // After the first display, a preview update makes no sound: the music
    // the route started is not started again.
    const updates = on.frames.filter(
      (f) => !["select", "play", "stop"].includes(f.step),
    );
    expect(updates.length).toBe(7);
    // The control: PLAY does start the music, so silence above is not a
    // scene that has none.
    expect(on.frames.find((f) => f.step === "play")!.sound.join("\n")).toContain("theme");
    for (const frame of updates) {
      expect(frame.sound, frame.step).toEqual([]);
    }
    expect(on.movedOn).toBe(true);
    expect(on.loaded).toBe(true);
  }, 240_000);
});

/** The errors a program reports, as `[line, message]`. */
const errorsOf = (program: any) =>
  Object.values(program?.diagnostics ?? {})
    .flat()
    .filter((d: any) => d.severity === 1)
    .map((d: any) => [d.range.start.line, typeof d.message === "string" ? d.message : d.message.value]);

describe("the player's worker", () => {
  it("reports a construct the program cannot compile at its line, keeps the game it has, and runs the program engine again once it is removed", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: SECOND },
    });
    framesForStop(h);
    try {
      const compiler = h.workerState.compilerState.compiler as any;
      // What each compile in the worker made.
      const compiled: { program: any; produced: boolean }[] = [];
      compiler.addEventListener("compiler/didCompile", (params: any) => {
        compiled.push({ program: params.program, produced: params.produced });
      });
      // Whether a game runs the program engine, as a boolean: a failing
      // assertion on the engine itself would print a whole story.
      const onProgramEngine = (story: unknown) => story instanceof ProgramStory;

      expect(await h.compile()).not.toHaveProperty("error");
      await h.select(SECOND);
      const game = h.workerState.gameState.game;
      const program = game?.program;
      expect(onProgramEngine(game?.story)).toBe(true);
      expect(h.overlay.textContent).toContain("The second line.");

      // An `external` declaration typed at the end: the compile reports it at
      // its line and makes no program.
      const at = { line: END, character: 0 };
      await h.edit([{ range: { start: at, end: at }, text: EXTERNAL }]);
      const unsupported = await h.compile();
      expect(unsupported).not.toHaveProperty("error");
      expect(unsupported.program.runnable).toBe(false);
      const made = compiled.at(-1)!;
      expect(made.produced).toBe(false);
      expect(made.program.chunks).toBeUndefined();
      expect(errorsOf(made.program)).toEqual([[END, unsupportedConstructMessage("external")]]);
      // The worker keeps the game it has, with the program before, and the
      // page keeps showing its beat.
      await h.select(SECOND);
      expect(h.workerState.gameState.game === game).toBe(true);
      expect(h.workerState.gameState.game?.program === program).toBe(true);
      expect(h.overlay.textContent).toContain("The second line.");

      // PLAY runs the program before on the program engine.
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(40);
      expect(onProgramEngine(h.playing()?.story)).toBe(true);
      expect(h.playing()?.program === program).toBe(true);
      await h.controller.stopGame("quit");
      await settle(40);

      // The declaration deleted again: the program has its chunks, and the
      // game runs the program engine.
      await h.edit([
        { range: { start: at, end: { line: END + 1, character: 0 } }, text: "" },
      ]);
      expect(await h.compile()).not.toHaveProperty("error");
      await h.select(SECOND);
      expect(h.workerState.gameState.game?.program.chunks).toBeDefined();
      expect(onProgramEngine(h.workerState.gameState.game?.story)).toBe(true);
      expect(h.overlay.textContent).toContain("The second line.");

      // PLAY runs the program engine too.
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(40);
      expect(onProgramEngine(h.playing()?.story)).toBe(true);
      await h.controller.stopGame("quit");
      await settle(40);
    } finally {
      h.dispose();
    }
  }, 120_000);
});

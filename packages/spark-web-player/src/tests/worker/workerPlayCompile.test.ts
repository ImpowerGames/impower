// PLAY's game in the worker shares the thread with the compiler, and a compile
// re-parents the runtime containers of every flow it reuses into its new story
// (#682). PLAY's game runs a story of its own, written out from the program
// once, so a compile in the middle of a run leaves the run exactly as it would
// have been.
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { CompileProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `store mood = 0

-> start

scene start
  HERO:
    The first line.
  & mood = 1
  HERO:
    The second line, {mood}.
  & mood = mood + 1
  -> after

scene after
  HERO:
    The third line, {mood}.
  HERO:
    The last line.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const FIRST = lineOf("The first line.");
const THIRD = lineOf("The third line");

/** The message as a run sends it, without the ids requests are given fresh
 *  in every run, its own and those of the requests a batch carries. */
const comparable = (message: any): any => {
  const { id: _id, ...rest } = message;
  if (Array.isArray(rest.params?.messages)) {
    return {
      ...rest,
      params: { ...rest.params, messages: rest.params.messages.map(comparable) },
    };
  }
  return rest;
};

/** PLAY from the first line, advanced by a click and a second of frames at a
 *  time to the last line. With `compileAt`, the author edits a later line and the
 *  worker compiles the edit after that many clicks. Answers everything PLAY's
 *  game sent the page. */
const run = async (compileAt?: number) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: FIRST },
    manualClock: true,
  });
  // A run that ends stops the game, which waits a frame this page does not
  // draw.
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  try {
    await h.compile();
    await h.select(FIRST);
    await settle(40);
    const sentBefore = h.toRouter.length;
    expect(await h.controller.startGameAndApp()).toBe(true);
    const running = h.workerState.gameState.running!;
    await settle(40);
    await h.tick(1000 / 60, 60);
    let compiled: any;
    for (let click = 0; click < 3; click++) {
      if (click === compileAt) {
        const before = h.workerState.gameState.game!.program;
        await h.edit([
          {
            range: {
              start: { line: THIRD, character: 4 },
              end: { line: THIRD, character: 4 + "The third line".length },
            },
            text: "An edited third line",
          },
        ]);
        // The worker compiles the edit while the game runs. The page is not
        // handed the program, so nothing restarts the run.
        compiled = await h.page.sendRequest(CompileProgramMessage.type, {
          textDocument: { uri: MAIN_URI },
          startFrom: { file: MAIN_URI, line: FIRST },
        });
        // The compile gave the previewing game its program and replayed its
        // route in the new story.
        expect(h.workerState.gameState.game!.program).not.toBe(before);
      }
      h.controller._app.emit(
        EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
      );
      await settle(10);
      await h.tick(1000 / 60, 60);
    }
    // The same game ran throughout, on a story no compile built.
    expect(h.workerState.gameState.running).toBe(running);
    expect(running.story).not.toBe(h.workerState.gameState.game!.story);
    const sent = h.toRouter.slice(sentBefore).map(comparable);
    await h.controller.destroyGameAndApp();
    // The text the run wrote, in order: a line is written a character at a
    // time.
    const texts: string[] = [];
    const collect = (value: any) => {
      if (value && typeof value === "object") {
        if (typeof value.text === "string") texts.push(value.text);
        for (const item of Object.values(value)) collect(item);
      }
    };
    for (const m of sent) {
      if (m.method === "ui/write-text") collect(m.params);
    }
    const text = texts.join("");
    return { sent, compiled, text };
  } finally {
    h.dispose();
  }
};

describe("a compile in the middle of PLAY in the worker", () => {
  it("leaves every message the running game sends as an undisturbed run sends it", async () => {
    const undisturbed = await run();
    const disturbed = await run(1);

    // The compile did compile the edit, and the run went past the line it
    // edited, showing the line as the run's own program has it.
    expect(disturbed.compiled.program).toBeTruthy();
    expect(undisturbed.text).toContain("The third line, 2.");
    expect(undisturbed.text).toContain("The last line.");
    expect(disturbed.text).not.toContain("An edited third line");

    // The first message the two runs disagree on, if any: a whole-stream
    // comparison of two long streams that differ is too large to report.
    const length = Math.max(disturbed.sent.length, undisturbed.sent.length);
    let first = -1;
    for (let i = 0; i < length && first < 0; i++) {
      if (JSON.stringify(disturbed.sent[i]) !== JSON.stringify(undisturbed.sent[i])) {
        first = i;
      }
    }
    expect({
      first,
      undisturbed: JSON.stringify(undisturbed.sent[first] ?? null).slice(0, 600),
      disturbed: JSON.stringify(disturbed.sent[first] ?? null).slice(0, 600),
    }).toEqual({ first: -1, undisturbed: "null", disturbed: "null" });
    expect(disturbed.sent.length).toBe(undisturbed.sent.length);
  }, 180_000);
});

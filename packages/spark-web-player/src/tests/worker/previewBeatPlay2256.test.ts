import { afterEach, describe, expect, it } from "vitest";
import { SetAnimatePortraitsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetAnimatePortraitsMessage";
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { MorphPlayback } from "../../app/morph/MorphPlayback";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `define mia as character with
  name = "MIA"
end

scene start
  MIA: First line.
  MIA: Hello <wait:1> there.
  MIA: Third line.
end
`;

const FIRST = 5;
const WAITING = 6;

type Harness = Awaited<ReturnType<typeof createPlayerHarness>>;

let harness: Harness | undefined;

afterEach(() => {
  harness?.dispose();
  harness = undefined;
});

const ops = (messages: any[]): any[] =>
  messages.flatMap((message) =>
    Array.isArray(message?.params?.messages)
      ? [message, ...ops(message.params.messages)]
      : [message],
  );

async function previewAt(line: number) {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line },
    manualClock: true,
  });
  harness = h;
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  await h.compile();
  await h.select(line);
  await settle(40);
  return h;
}

const playBeat = (h: Harness) =>
  h.controller.handlePlayBeat({
    jsonrpc: "2.0",
    id: 1,
    method: "preview/playBeat",
    params: {},
  });

const beatState = (h: Harness) => h.controller.getGameState().beat;

const shownText = (h: Harness) => h.overlay.textContent ?? "";

const speech = (h: Harness) =>
  ops(h.toRouter).filter((m) => m?.method === "morph/speech");

const morphs = (h: Harness) => MorphPlayback.for(h.overlay) as any;

async function untilPlayed(h: Harness, limitMS = 6000) {
  for (let elapsed = 0; elapsed < limitMS && beatState(h)?.playing; elapsed += 100) {
    await h.tick(100);
  }
}

describe("Replay beat in the stopped preview (#2256)", () => {
  it("plays the shown beat once, silently, then ends on the still it showed", async () => {
    const h = await previewAt(WAITING);
    const still = shownText(h);
    expect(still).toContain("there.");
    expect(beatState(h)).toEqual({ playing: false, refusal: null });
    h.toRouter.length = 0;
    h.toEditor.length = 0;

    const answer = await playBeat(h);
    await settle(20);
    expect(answer.result).toEqual({ playing: true });
    expect(beatState(h)?.playing).toBe(true);
    const spoken = speech(h);
    expect(spoken.length).toBeGreaterThan(0);
    expect(spoken[0].params.spans.length).toBeGreaterThan(0);
    const timed = ops(h.toRouter).filter(
      (m) => m?.method === "ui/write-text" && m.params?.instant === false,
    );
    expect(timed.length).toBeGreaterThan(0);
    const afters = timed.flatMap((m) =>
      m.params.instructions.map((i: { after?: number }) => i.after ?? 0),
    );
    expect(Math.max(...afters)).toBeGreaterThanOrEqual(1);

    await h.tick(100, 5);
    expect(beatState(h)?.playing).toBe(true);
    await untilPlayed(h);
    expect(beatState(h)?.playing).toBe(false);
    expect(shownText(h)).toBe(still);
    expect(h.playing()).toBeFalsy();
    expect(h.controller.getGameState().launchState).toBe("preview");
    const sounded = ops(h.toRouter)
      .filter((m) => m?.method === "audio/update")
      .flatMap((m) => m.params?.updates ?? [])
      .filter((update: any) => update.control === "start");
    expect(sounded).toEqual([]);
    const published = h.toEditor
      .filter((m) => m?.method === "preview/didChangeGameState")
      .map((m) => m.params.beat?.playing);
    expect(published).toContain(true);
    expect(published.at(-1)).toBe(false);
  }, 120_000);

  it("a click on the preview while the beat plays finishes it at once on the still", async () => {
    const h = await previewAt(WAITING);
    const still = shownText(h);
    await playBeat(h);
    await settle(20);
    await h.tick(100, 3);
    expect(beatState(h)?.playing).toBe(true);
    h.controller._app.emit(
      EventMessage.type.notification({ type: "pointerdown", button: 0 } as any),
    );
    await settle(20);
    expect(beatState(h)?.playing).toBe(false);
    expect(shownText(h)).toBe(still);
  }, 120_000);

  it("speech morphs play during the beat with idle animations off, then rest and follow the switch again", async () => {
    const h = await previewAt(WAITING);
    await h.controller.handleSetAnimatePortraits({
      jsonrpc: "2.0",
      id: 2,
      method: SetAnimatePortraitsMessage.method,
      params: { enabled: false },
    });
    expect(morphs(h).animating).toBe(false);
    await playBeat(h);
    await settle(20);
    expect(morphs(h).animating).toBe(true);
    expect(morphs(h).speech?.spans.length).toBeGreaterThan(0);
    await untilPlayed(h);
    expect(morphs(h).speech?.spans ?? []).toEqual([]);
    for (let waited = 0; waited < 2000 && morphs(h).animating; waited += 50) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(morphs(h).animating).toBe(false);
  }, 120_000);

  it("a caret move while the beat plays cancels it and shows the new line's still", async () => {
    const h = await previewAt(WAITING);
    await playBeat(h);
    await settle(20);
    await h.tick(100, 3);
    expect(beatState(h)?.playing).toBe(true);
    await h.select(FIRST);
    await settle(40);
    expect(beatState(h)?.playing).toBe(false);
    expect(shownText(h)).toContain("First line.");
    expect(shownText(h)).not.toContain("there.");
    await h.tick(100, 30);
    expect(shownText(h)).toContain("First line.");
  }, 120_000);

  it("pressing Replay beat again while it plays restarts the beat", async () => {
    const h = await previewAt(WAITING);
    await playBeat(h);
    await settle(20);
    await h.tick(100, 3);
    h.toRouter.length = 0;
    const again = await playBeat(h);
    await settle(20);
    expect(again.result).toEqual({ playing: true });
    expect(beatState(h)?.playing).toBe(true);
    expect(speech(h).some((m) => m.params.spans.length > 0)).toBe(true);
    await untilPlayed(h);
    expect(beatState(h)?.playing).toBe(false);
  }, 120_000);
});

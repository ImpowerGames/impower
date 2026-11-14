import { afterEach, describe, expect, it } from "vitest";
import { SelectCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/SelectCompilerDocumentMessage";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `define mia as character with
  name = "MIA"
end

scene start
  MIA: First line.
  MIA:
    Hello <wait:1> there.
  MIA: Third line.

  MIA: Fourth line.
end
`;

const FIRST = 5;
const SPEAKER = 6;
const WAITING = 7;
const THIRD = 8;
const BLANK = 9;
const FOURTH = 10;

const SETTLE_MS = 1000;

type Harness = Awaited<ReturnType<typeof createPlayerHarness>>;

let harness: Harness | undefined;

afterEach(() => {
  harness?.dispose();
  harness = undefined;
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function previewAt(line: number, autoPlay = true) {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line },
    manualClock: true,
  });
  harness = h;
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  expect(h.controller.autoPlaySettleMS).toBe(200);
  h.controller.autoPlaySettleMS = SETTLE_MS;
  await h.compile();
  await h.select(line);
  await settle(40);
  await setAutoPlay(h, autoPlay);
  return h;
}

const setAutoPlay = (h: Harness, enabled: boolean) =>
  h.controller.handleSetAutoPlayBeats({
    jsonrpc: "2.0",
    id: 1,
    method: "preview/setAutoPlayBeats",
    params: { enabled },
  });

const playing = (h: Harness) => !!h.controller.getGameState().beat?.playing;

const plays = (h: Harness): number => h.controller._beatPlays;

const shownText = (h: Harness) => h.overlay.textContent ?? "";

async function untilPlayed(h: Harness, limitMS = 6000) {
  for (let elapsed = 0; elapsed < limitMS && playing(h); elapsed += 100) {
    await h.tick(100);
  }
}

async function rest(h: Harness) {
  await wait(SETTLE_MS + 200);
  await settle(20);
}

async function selectWithEdit(h: Harness, line: number, character: number) {
  const result = await h.page.sendRequest(SelectCompilerDocumentMessage.type, {
    textDocument: { uri: MAIN_URI },
    selectedRange: {
      start: { line, character },
      end: { line, character },
    },
    docChanged: true,
    userEvent: true,
  });
  await h.controller.handleSelectedCompilerDocument({ params: result });
  await settle();
}

describe("Auto-play beats in the stopped preview (#2257)", () => {
  it("plays a beat the caret lands on once it rests for the settle delay, and not before", async () => {
    const h = await previewAt(FIRST);
    await h.select(WAITING);
    expect(playing(h)).toBe(false);
    await wait(SETTLE_MS / 2);
    expect(playing(h)).toBe(false);
    expect(plays(h)).toBe(0);
    await rest(h);
    expect(plays(h)).toBe(1);
    expect(playing(h)).toBe(true);
    await untilPlayed(h);
    expect(playing(h)).toBe(false);
    expect(shownText(h)).toContain("there.");
    await rest(h);
    expect(plays(h)).toBe(1);
  }, 120_000);

  it("plays nothing for beats the caret passes within the delay, then plays the beat it rests on", async () => {
    const h = await previewAt(FIRST);
    await h.select(WAITING);
    await wait(SETTLE_MS / 5);
    await h.select(FIRST);
    await wait(SETTLE_MS / 5);
    await h.select(THIRD);
    expect(plays(h)).toBe(0);
    await rest(h);
    expect(plays(h)).toBe(1);
    expect(playing(h)).toBe(true);
    await untilPlayed(h);
    expect(shownText(h)).toContain("Third line.");
  }, 120_000);

  it("cancels a playing beat at once when the caret moves to another beat", async () => {
    const h = await previewAt(FIRST);
    await h.select(WAITING);
    await rest(h);
    await h.tick(100, 3);
    expect(playing(h)).toBe(true);
    await h.select(THIRD);
    expect(playing(h)).toBe(false);
    expect(shownText(h)).toContain("Third line.");
    expect(shownText(h)).not.toContain("there.");
  }, 120_000);

  it("does not replay the beat when the caret moves within it", async () => {
    const h = await previewAt(FIRST);
    await h.select(WAITING);
    await rest(h);
    expect(plays(h)).toBe(1);
    await untilPlayed(h);
    const still = shownText(h);
    await h.select(SPEAKER);
    await rest(h);
    expect(shownText(h)).toBe(still);
    await h.select(WAITING);
    await rest(h);
    expect(plays(h)).toBe(1);
    expect(playing(h)).toBe(false);
  }, 120_000);

  it("plays the beat a line without its own beat shows, and not again when the caret moves onto that beat", async () => {
    const h = await previewAt(FIRST);
    await h.select(BLANK);
    await rest(h);
    expect(plays(h)).toBe(1);
    await untilPlayed(h);
    expect(shownText(h)).toContain("Fourth line.");
    await h.select(FOURTH);
    await rest(h);
    expect(plays(h)).toBe(1);
    expect(playing(h)).toBe(false);
  }, 120_000);

  it("restarts the delay, rather than dropping the landing, when the caret moves on within the beat it landed on", async () => {
    const h = await previewAt(FIRST);
    await h.select(WAITING);
    await wait(SETTLE_MS / 2);
    await h.select(SPEAKER);
    await wait(SETTLE_MS / 2);
    expect(plays(h)).toBe(0);
    await rest(h);
    expect(plays(h)).toBe(1);
  }, 120_000);

  it("shows the still for a selection that comes with an edit, and the redraw after its recompile, without playing", async () => {
    const h = await previewAt(FIRST);
    await h.edit([
      {
        range: {
          start: { line: WAITING, character: 9 },
          end: { line: WAITING, character: 9 },
        },
        text: "X",
      },
    ]);
    await selectWithEdit(h, WAITING, 10);
    await rest(h);
    expect(plays(h)).toBe(0);
    await h.compile();
    await settle(40);
    expect(shownText(h)).toContain("HelloX");
    await rest(h);
    expect(plays(h)).toBe(0);
    expect(playing(h)).toBe(false);
    await h.select(WAITING);
    await rest(h);
    expect(plays(h)).toBe(0);
  }, 120_000);

  it("plays nothing for a selection that comes with a text change, even when it shows a different beat", async () => {
    const h = await previewAt(FIRST);
    await selectWithEdit(h, WAITING, 0);
    await rest(h);
    expect(shownText(h)).toContain("there.");
    expect(plays(h)).toBe(0);
    await h.select(WAITING);
    await rest(h);
    expect(plays(h)).toBe(0);
  }, 120_000);

  it("plays nothing when typing starts while the landing's preview is still being drawn", async () => {
    const h = await previewAt(FIRST);
    const request = h.link.request.bind(h.link);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let arrived!: () => void;
    const answered = new Promise<void>((resolve) => (arrived = resolve));
    let hold = true;
    (h.link as any).request = async (type: unknown, params: unknown) => {
      const result = await request(type as any, params as any);
      if (hold && type === DisplayPreviewMessage.type) {
        hold = false;
        arrived();
        await held;
      }
      return result;
    };
    const landing = await h.selectWithoutWaiting(THIRD);
    await answered;
    await h.edit([
      {
        range: { start: { line: THIRD, character: 18 }, end: { line: THIRD, character: 18 } },
        text: "X",
      },
    ]);
    const edited = await h.page.sendRequest(SelectCompilerDocumentMessage.type, {
      textDocument: { uri: MAIN_URI },
      selectedRange: {
        start: { line: THIRD, character: 19 },
        end: { line: THIRD, character: 19 },
      },
      docChanged: true,
      userEvent: true,
    });
    expect(edited.programOutdated).toBe(true);
    await h.controller.handleSelectedCompilerDocument({ params: edited });
    release();
    await landing.previewed;
    await rest(h);
    expect(playing(h)).toBe(false);
    expect(plays(h)).toBe(0);
  }, 120_000);

  it("returns to the still at once when typing starts while a beat plays", async () => {
    const h = await previewAt(FIRST);
    await h.select(WAITING);
    await rest(h);
    await h.tick(100, 3);
    expect(playing(h)).toBe(true);
    await h.edit([
      {
        range: { start: { line: WAITING, character: 9 }, end: { line: WAITING, character: 9 } },
        text: "X",
      },
    ]);
    const edited = await h.page.sendRequest(SelectCompilerDocumentMessage.type, {
      textDocument: { uri: MAIN_URI },
      selectedRange: {
        start: { line: WAITING, character: 10 },
        end: { line: WAITING, character: 10 },
      },
      docChanged: true,
      userEvent: true,
    });
    expect(edited.programOutdated).toBe(true);
    await h.controller.handleSelectedCompilerDocument({ params: edited });
    await settle(40);
    expect(playing(h)).toBe(false);
    expect(h.workerState.gameState.game?.playingBeat).toBe(false);
    expect(shownText(h)).toContain("there.");
    await rest(h);
    expect(plays(h)).toBe(1);
  }, 120_000);

  it("plays nothing on landing while auto-play is off, including after it is turned off during the delay", async () => {
    const h = await previewAt(FIRST, false);
    await h.select(WAITING);
    await rest(h);
    expect(plays(h)).toBe(0);
    await setAutoPlay(h, true);
    await h.select(THIRD);
    await setAutoPlay(h, false);
    await rest(h);
    expect(plays(h)).toBe(0);
  }, 120_000);
});

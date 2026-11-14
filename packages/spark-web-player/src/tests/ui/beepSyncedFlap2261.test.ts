import { afterEach, describe, expect, test, vi } from "vitest";
import AudioPlayer from "../../../../spark-dom/src/classes/AudioPlayer";
import { createMorphHost, inlineMorphSource, type MorphHost } from "@impower/sparkdown/src/morph/hosts";
import { renderMorphAt } from "@impower/sparkdown/src/morph/render";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphArtifact } from "@impower/sparkdown/src/morph/types";
import { talkingPortrait, talkScript } from "@impower/sparkdown/src/tests/morph/fixtures";
import { AudioClock } from "../../app/AudioClock";
import AudioManager from "../../app/managers/AudioManager";
import UIManager from "../../app/managers/UIManager";
import { MorphPlayback } from "../../app/morph/MorphPlayback";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const lineOf = (source: string, text: string) => source.split("\n").findIndex((l) => l.includes(text));

const manualFrames = () => ({ requestFrame: () => 0, cancelFrame: () => {} });

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

function leafStates(root: ParentNode): Record<string, { shown: boolean; d: string | null }[]> {
  const out: Record<string, { shown: boolean; d: string | null }[]> = {};
  for (const el of Array.from(root.querySelectorAll("[data-morph]"))) {
    const node = el.getAttribute("data-morph")!;
    const style = el.getAttribute("style") ?? "";
    (out[node] ??= []).push({ shown: !/display:\s*none/.test(style), d: el.getAttribute("d") });
  }
  return out;
}

const referenceStates = (artifact: MorphArtifact, offset: Record<string, number>) =>
  leafStates(new DOMParser().parseFromString(renderMorphAt(artifact, offset), "image/svg+xml"));

function inProcessHost(program: () => any): MorphHost {
  return createMorphHost({
    service: new MorphBakeService(),
    channel: () => program().morphs,
    readSource: inlineMorphSource(() => program().context),
  });
}

const timingOf = (sync: string) => `  timing {
    trigger = speech
    sync = ${sync}
    duration = 0.16
    easing = linear
  }
`;

const SCENE = `define mia as character with
  name = "MIA"
end

scene start
  MIA:
    [[show portrait mia]]
    First line.
end
`;

async function speaking(sync = "beep") {
  const source = `${talkScript(timingOf(sync))}\n${SCENE}`;
  const files = [{ uri: "inmemory:///mia.svg", type: "image", name: "mia", ext: "svg", data: talkingPortrait({ dx: 0, dy: 0 }) }];
  const h = createDOMHarness(source, 0, { files });
  const playback = MorphPlayback.for(h.overlay);
  playback.configure({ host: inProcessHost(() => h.game.program), seed: "test", ...manualFrames() });
  await h.ready;
  await h.preview(lineOf(source, "First line."));
  await flushMicrotasks(10);
  await until(() => playback.stats.live === 1, "the portrait's artifact");
  const image = [...(playback as any).layers].flatMap((layer: any) => layer.images)[0];
  const occurrence = image.plays.find((p: any) => p.occurrence).occurrence;
  const shadow = h.overlay.querySelector(".portrait .image > .instance > span.morph")!.shadowRoot!;
  const origin = playback.now;
  const starts: number[] = [];
  let last = -1;
  const at = (seconds: number) => {
    playback.advance(origin + seconds - playback.now);
    const head = playback.playhead(occurrence);
    if (head.phase === "playing" && head.play !== last) {
      starts.push(Math.round((playback.now - origin - head.offset * 0.16) * 1000) / 1000);
      last = head.play;
    }
    return head;
  };
  const sweep = (until: number) => {
    for (let t = Math.ceil((playback.now - origin) / 0.005 - 1e-6) * 0.005; t <= until + 1e-9; t += 0.005) at(t);
    return starts;
  };
  return { playback, at, sweep, starts, shadow, artifact: image.slot.artifact as MorphArtifact, rest: leafStates(shadow) };
}

const BEEPS = [0.1, 0.175, 0.25, 0.325, 0.4, 0.475];
const SPANS: [number, number][] = [[0.1, 0.55]];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("a beep-synced speech morph in the page (#2261)", () => {
  test("a play starts on a beep, beeps during it are skipped, and the next starts on the first beep after it ends", async () => {
    const { playback, at, sweep, shadow, artifact, rest } = await speaking();
    playback.speak("mia", SPANS, BEEPS);
    expect(at(0.05)).toEqual({ phase: "off" });
    expect(leafStates(shadow)).toEqual(rest);
    const opening = at(0.1);
    expect(opening).toMatchObject({ phase: "playing", play: 0, offset: expect.closeTo(0, 9) });
    const open = at(0.17);
    expect(open).toMatchObject({ phase: "playing", play: 0, offset: expect.closeTo(0.4375, 9) });
    expect(leafStates(shadow)).toEqual(referenceStates(artifact, { talk: (open as { offset: number }).offset }));
    expect(leafStates(shadow)).not.toEqual(rest);
    expect(sweep(1)).toEqual([0.1, 0.325]);
  });

  test("a beep at the moment a play ends starts the next play", async () => {
    const { playback, sweep } = await speaking();
    playback.speak("mia", [[0, 0.5]], [0, 0.16, 0.32]);
    expect(sweep(1)).toEqual([0, 0.16, 0.32]);
  });

  test("the play in progress after the last beep finishes, and none starts after it", async () => {
    const { playback, at, sweep, shadow, rest } = await speaking();
    playback.speak("mia", SPANS, BEEPS);
    sweep(0.48);
    expect(at(0.48)).toMatchObject({ phase: "playing", play: 1 });
    expect(at(0.6)).toEqual({ phase: "off" });
    expect(leafStates(shadow)).toEqual(rest);
    expect(sweep(2)).toEqual([0.1, 0.325]);
  });

  test("a skip keeps the play in progress and starts none after it", async () => {
    const { playback, at, sweep } = await speaking();
    playback.speak("mia", SPANS, BEEPS);
    expect(at(0.15)).toMatchObject({ phase: "playing", play: 0 });
    playback.speak("mia", [], []);
    expect(at(0.2)).toMatchObject({ phase: "playing", play: 0 });
    expect(at(0.3)).toEqual({ phase: "off" });
    expect(sweep(1)).toEqual([0.1]);
  });

  test("speech with no beeps, as a voice clip gives, flaps back to back for as long as it lasts", async () => {
    const { playback, sweep } = await speaking();
    playback.speak("mia", [[0, 0.5]]);
    expect(sweep(1)).toEqual([0, 0.16, 0.32, 0.48]);
  });

  test("a `sync = none` speech morph loops inside the spans as before, whatever the beeps", async () => {
    const { playback, sweep } = await speaking("none");
    playback.speak("mia", SPANS, BEEPS);
    expect(sweep(1)).toEqual([0.1, 0.26, 0.42]);
  });

  test("another character's beeps leave the portrait at rest", async () => {
    const { playback, sweep } = await speaking();
    playback.speak("bob", SPANS, BEEPS);
    expect(sweep(1)).toEqual([]);
  });
});

const makePage = () => {
  const context = {
    currentTime: 0,
    state: "running",
    destination: {},
    createGain: () => ({ gain: { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, setTargetAtTime() {} }, connect() {}, disconnect() {} }),
    createBufferSource: () => ({
      detune: { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, setTargetAtTime() {} },
      playbackRate: { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, setTargetAtTime() {} },
      addEventListener() {},
      removeEventListener() {},
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
    }),
  };
  const overlay = document.createElement("div");
  document.body.appendChild(overlay);
  const app: any = { overlay, audioContext: context, audioClock: new AudioClock(0, () => 0), emit: () => {} };
  const audio = new AudioManager(app);
  const ui = new UIManager(app);
  app.audio = audio;
  app.ui = ui;
  const morphs = MorphPlayback.for(overlay);
  morphs.configure({ requestFrame: () => 0, cancelFrame: () => {} });
  ui.onUpdate({ elapsedTime: 0 } as any);
  return {
    morphs,
    heard: () => (morphs as any).speech as { character?: string; spans: [number, number][]; beeps?: number[] } | undefined,
    async clip(key: string) {
      (audio as any).getAudioChannel("voice").set(key, new AudioPlayer({ duration: 3 } as AudioBuffer, context as any));
      await audio.updateAudioPlayers({ channel: "voice", updates: [{ control: "start", key }] as any });
    },
    say(params: Record<string, unknown>) {
      ui.onReceiveNotification({ jsonrpc: "2.0", method: "morph/speech", params } as any);
    },
  };
};

describe("the beeps the page hands the speaker's portraits (#2261)", () => {
  test("a typed line's beeps reach the portraits on the typed spans' clock", async () => {
    const page = makePage();
    page.say({ character: "mia", spans: [[0, 0.3]], beeps: [0, 0.075, 0.15] });
    const now = page.morphs.now;
    expect(page.heard()?.spans).toEqual([[now, now + 0.3]]);
    expect(page.heard()?.beeps).toEqual([now, now + 0.075, now + 0.15]);
  });

  test("a line spoken by a playing voice clip hands over no beeps", async () => {
    const page = makePage();
    await page.clip("mia_hello");
    page.say({ character: "mia", spans: [[0, 0.3]], beeps: [0, 0.075, 0.15], voiced: true });
    await flushMicrotasks(5);
    expect(page.heard()?.character).toBe("mia");
    expect(page.heard()?.beeps).toBeUndefined();
  });

  test("a voiced line whose clip is not playing falls back to its beeps", async () => {
    const page = makePage();
    page.say({ character: "mia", spans: [[0, 0.3]], beeps: [0, 0.075], voiced: true });
    const now = page.morphs.now;
    expect(page.heard()?.beeps).toEqual([now, now + 0.075]);
  });
});

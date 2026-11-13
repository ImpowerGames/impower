import { describe, expect, test } from "vitest";
import { AudioClock } from "../../app/AudioClock";
import AudioManager from "../../app/managers/AudioManager";

class StandInParam {
  constructor(public value: number) {}
  cancelScheduledValues() {}
  setValueAtTime(value: number) {
    this.value = value;
  }
  setTargetAtTime(value: number) {
    this.value = value;
  }
}

class StandInSource {
  detune = new StandInParam(0);
  playbackRate = new StandInParam(1);
  loop = false;
  buffer: unknown = null;
  startedAt?: number;
  addEventListener() {}
  removeEventListener() {}
  connect() {}
  disconnect() {}
  start(when: number) {
    this.startedAt = when;
  }
  stop() {}
}

const makeContext = () => {
  const sources: StandInSource[] = [];
  const context = {
    currentTime: 0,
    sampleRate: 48000,
    state: "running",
    destination: {},
    createGain: () => ({ gain: new StandInParam(1), connect() {}, disconnect() {} }),
    createAnalyser: () => ({ fftSize: 2048, connect() {}, disconnect() {}, getFloatTimeDomainData() {} }),
    createBuffer: (_channels: number, length: number) => ({ duration: length / 48000, length }),
    createBufferSource: () => {
      const source = new StandInSource();
      sources.push(source);
      return source;
    },
  };
  return { context, sources };
};

const makeAudio = () => {
  const app: any = {
    audioContext: undefined,
    audioClock: new AudioClock(0, () => 0),
    emit: () => {},
  };
  const audio = new AudioManager(app);
  (audio as any)._unsafeAudioContext = makeContext().context;
  const { context, sources } = makeContext();
  return {
    audio,
    sources,
    setContext() {
      app.audioContext = context;
      audio.onAudioContextRunning();
    },
  };
};

const VOICE = { key: "mia_hello", channel: "voice", mixer: "voice" } as any;

describe("an audio load that finishes before the audio context is set (#2231)", () => {
  test("the clip gets a player, plays and notifies clip-start listeners once the context is set", async () => {
    const page = makeAudio();
    const started: number[] = [];
    page.audio.onClipStart("voice", (clip) => started.push(clip.startedAt));

    await page.audio.loadAudioPlayer(VOICE);
    page.setContext();
    await page.audio.updateAudioPlayers({
      channel: "voice",
      updates: [{ control: "start", key: "mia_hello" }],
    } as any);

    expect(page.sources).toHaveLength(1);
    expect(page.sources[0]!.startedAt).toBe(0);
    expect(started).toEqual([0]);
    expect([...(page.audio as any)._audioMixers.keys()]).toContain("voice");
  });

  test("a load that finishes after the context is set still gets its player", async () => {
    const page = makeAudio();
    page.setContext();
    await page.audio.loadAudioPlayer(VOICE);
    await page.audio.updateAudioPlayers({
      channel: "voice",
      updates: [{ control: "start", key: "mia_hello" }],
    } as any);
    expect(page.sources).toHaveLength(1);
  });
});

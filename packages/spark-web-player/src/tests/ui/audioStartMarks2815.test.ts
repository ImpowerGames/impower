import { afterEach, describe, expect, test } from "vitest";
import { AudioClock } from "../../app/AudioClock";
import AudioManager from "../../app/managers/AudioManager";
import { markPlayStarted } from "../../app/utils/AudioStartMarks";

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
  addEventListener() {}
  removeEventListener() {}
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
}

const makeAudio = async () => {
  const context = {
    currentTime: 0,
    sampleRate: 48000,
    state: "running",
    destination: {},
    createGain: () => ({ gain: new StandInParam(1), connect() {}, disconnect() {} }),
    createAnalyser: () => ({ fftSize: 2048, connect() {}, disconnect() {}, getFloatTimeDomainData() {} }),
    createBuffer: (_channels: number, length: number) => ({ duration: length / 48000, length }),
    createBufferSource: () => new StandInSource(),
  };
  const app: any = { audioContext: context, audioClock: new AudioClock(0, () => 0), emit: () => {} };
  const audio = new AudioManager(app);
  audio.onAudioContextRunning();
  for (const key of ["theme", "bell", "beep"]) {
    await audio.loadAudioPlayer({ key, channel: key === "theme" ? "music" : "sound" } as any);
  }
  (audio as any)._synthKeys.add("beep");
  const start = (channel: string, key: string, after = 0) =>
    audio.updateAudioPlayers({ channel, updates: [{ control: "start", key, after }] } as any);
  return { start };
};

const entries = (prefix: string) =>
  performance.getEntries().filter((entry) => entry.name.startsWith(prefix));

afterEach(() => {
  performance.clearMarks();
  performance.clearMeasures();
});

describe("the time from Run to a sound's first sample (#2815)", () => {
  test("is measured from the play-started mark to when the sound's first sample is scheduled", async () => {
    const audio = await makeAudio();
    markPlayStarted();
    const playStarted = entries("play started")[0]!.startTime;
    const before = performance.now();
    await audio.start("music", "theme", 0.25);
    const after = performance.now();

    const [started] = entries("audio started music:theme");
    expect(started!.startTime).toBeGreaterThanOrEqual(before + 250);
    expect(started!.startTime).toBeLessThanOrEqual(after + 250);
    const [measure] = entries("play to audio music:theme");
    expect(measure!.startTime).toBe(playStarted);
    expect(measure!.duration).toBeCloseTo(started!.startTime - playStarted, 6);
  });

  test("records each sound once per play, skips voice beeps, and forgets the last play when the next starts", async () => {
    const audio = await makeAudio();
    markPlayStarted();
    await audio.start("music", "theme");
    await audio.start("music", "theme");
    await audio.start("sound", "bell");
    await audio.start("sound", "beep");
    expect(entries("audio started").map((entry) => entry.name)).toEqual([
      "audio started music:theme",
      "audio started sound:bell",
    ]);
    expect(entries("play to audio")).toHaveLength(2);

    markPlayStarted();
    expect(entries("audio started")).toHaveLength(0);
    expect(entries("play started")).toHaveLength(1);
    await audio.start("music", "theme");
    expect(entries("audio started").map((entry) => entry.name)).toEqual(["audio started music:theme"]);
  });
});

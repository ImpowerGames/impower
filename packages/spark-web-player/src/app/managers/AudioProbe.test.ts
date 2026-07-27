import { describe, expect, it } from "vitest";
import type AudioMixer from "../../../../spark-dom/src/classes/AudioMixer";
import AudioProbe from "./AudioProbe";

/**
 * The probe is what makes audio answerable by someone who cannot hear it
 * (#273), so its bookkeeping had better be right. `AudioProbe` takes its
 * mixers by injection and only ever calls `readLevels()`, so none of this
 * needs Web Audio -- a fake mixer is enough.
 */

/** A mixer whose output we drive by hand. */
const fakeMixer = (levels: { rms: number; peak: number }) =>
  ({
    readLevels: () => levels,
  }) as unknown as AudioMixer;

/** A probe over mixers we can swap between samples, with a clock we control. */
const createProbe = () => {
  const mixers = new Map<string, AudioMixer>();
  let now = 1000;
  const probe = new AudioProbe(() => mixers.entries(), () => now);
  return {
    probe,
    mixers,
    set: (name: string, rms: number, peak = rms) =>
      mixers.set(name, fakeMixer({ rms, peak })),
    advance: (ms: number) => {
      now += ms;
    },
    at: () => now,
  };
};

describe("AudioProbe", () => {
  describe("levels", () => {
    it("reports each mixer separately", () => {
      const h = createProbe();
      h.set("main", 0.3);
      h.set("music", 0.1);

      const reading = h.probe.sample();

      expect(reading["main"]!.rms).toBeCloseTo(0.3);
      expect(reading["music"]!.rms).toBeCloseTo(0.1);
    });

    it("passes peak through alongside rms", () => {
      // Peak catches a single click that barely moves the rms average.
      const h = createProbe();
      h.set("main", 0.001, 0.9);

      const reading = h.probe.sample();

      expect(reading["main"]!.peak).toBeCloseTo(0.9);
    });
  });

  describe("lastNonSilentAt", () => {
    it("is null before a mixer has ever made a sound", () => {
      const h = createProbe();
      h.set("main", 0);

      expect(h.probe.sample()["main"]!.lastNonSilentAt).toBeNull();
    });

    it("records when a mixer became audible", () => {
      const h = createProbe();
      h.set("main", 0.3);

      expect(h.probe.sample()["main"]!.lastNonSilentAt).toBe(h.at());
    });

    it("survives the mixer falling silent again", () => {
      // The whole point of the field: a level read a moment too late is zero,
      // but this still says the sound happened, and when.
      const h = createProbe();
      h.set("main", 0.3);
      h.probe.sample();
      const playedAt = h.at();

      h.advance(500);
      h.set("main", 0);
      const reading = h.probe.sample()["main"]!;

      expect(reading.rms).toBe(0);
      expect(reading.lastNonSilentAt).toBe(playedAt);
    });

    it("moves forward each time the mixer sounds again", () => {
      const h = createProbe();
      h.set("main", 0.3);
      h.probe.sample();

      h.advance(500);
      const secondTime = h.at();
      h.probe.sample();

      expect(h.probe.sample()["main"]!.lastNonSilentAt).toBe(secondTime);
    });

    it("treats denormal noise as silence", () => {
      // Guards against a probe that calls anything above literal zero a
      // sound, which would make `lastNonSilentAt` meaningless.
      const h = createProbe();
      h.set("main", 1e-9);

      expect(h.probe.sample()["main"]!.lastNonSilentAt).toBeNull();
    });

    it("tracks each mixer's history independently", () => {
      const h = createProbe();
      h.set("voice", 0.3);
      h.set("music", 0);
      h.probe.sample();

      const reading = h.probe.sample();
      expect(reading["voice"]!.lastNonSilentAt).not.toBeNull();
      expect(reading["music"]!.lastNonSilentAt).toBeNull();
    });
  });

  describe("snapshot", () => {
    it("does not hand out live internals", () => {
      const h = createProbe();
      h.set("main", 0.3);
      h.probe.sample();

      const snapshot = h.probe.snapshot();
      snapshot["main"]!.rms = 999;

      expect(h.probe.snapshot()["main"]!.rms).toBeCloseTo(0.3);
    });

    it("is empty before anything has been sampled", () => {
      expect(createProbe().probe.snapshot()).toEqual({});
    });
  });

  describe("lifecycle", () => {
    it("is not running until started", () => {
      expect(createProbe().probe.running).toBe(false);
    });

    it("can be sampled without starting the frame loop", () => {
      // How a one-off console query works: no rAF, just a reading.
      const h = createProbe();
      h.set("main", 0.3);

      expect(h.probe.sample()["main"]!.rms).toBeCloseTo(0.3);
      expect(h.probe.running).toBe(false);
    });

    it("stopping an unstarted probe is harmless", () => {
      expect(() => createProbe().probe.stop()).not.toThrow();
    });
  });
});

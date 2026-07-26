import { describe, expect, it } from "vitest";
import { Clock } from "./Clock";

/**
 * `Clock` takes both its time source and its frame scheduler by injection, so
 * these tests drive it deterministically -- no timers, no real time, no
 * flakiness. Every "frame" happens because a test asked for one.
 *
 * Note the unit contract: `ClockSource.currentTime` is documented in seconds,
 * and the frame budget is computed as `1 / maxFPS`, also in seconds. The tests
 * below are written in seconds throughout; a source reporting some other unit
 * silently breaks frame limiting rather than failing loudly.
 *
 * That last point is not hypothetical -- the player currently feeds this
 * `performance.now()`, which is milliseconds. These tests pin the seconds
 * contract deliberately, so they describe what `Clock` is supposed to be
 * handed rather than what one caller happens to hand it. Tracked separately.
 */

const createHarness = (startSeconds = 0) => {
  let now = startSeconds;
  const pending: (() => void)[] = [];
  const clock = new Clock(
    {
      get currentTime() {
        return now;
      },
    },
    (callback) => {
      pending.push(callback);
      return pending.length;
    },
  );

  const ticks: number[] = [];
  clock.add((c) => ticks.push(c.deltaTime));

  return {
    clock,
    ticks,
    /** How many frames the clock has queued but not yet run. */
    queued: () => pending.length,
    /** Move the time source forward, then run one queued frame. */
    tick(seconds: number) {
      now += seconds;
      pending.shift()?.();
    },
    /** Run one queued frame without moving time. */
    frame() {
      pending.shift()?.();
    },
    now: () => now,
    setNow(seconds: number) {
      now = seconds;
    },
  };
};

/** A frame budget at the default 60fps is 1/60s; these sit either side of it. */
const OVER_BUDGET = 0.02;
const UNDER_BUDGET = 0.01;

/**
 * Assert exactly one tick of roughly `seconds`. Tolerance matters wherever a
 * test offsets the clock by a large value -- `1000 + 0.02 - 1000` doesn't come
 * back as exactly `0.02` in floating point.
 */
const expectOneTick = (ticks: number[], seconds: number) => {
  expect(ticks).toHaveLength(1);
  expect(ticks[0]).toBeCloseTo(seconds, 10);
};

describe("Clock", () => {
  describe("starting and stopping", () => {
    it("is not running before start", () => {
      const { clock } = createHarness();
      expect(clock.running).toBe(false);
    });

    it("runs after start and queues a frame", () => {
      const h = createHarness();
      h.clock.start();
      expect(h.clock.running).toBe(true);
      expect(h.queued()).toBe(1);
    });

    it("anchors start and previous time to the source", () => {
      const h = createHarness(12.5);
      h.clock.start();
      expect(h.clock.startTime).toBe(12.5);
      expect(h.clock.prevTime).toBe(12.5);
    });

    it("does not tick on the frame start schedules", () => {
      const h = createHarness();
      h.clock.start();
      expect(h.ticks).toEqual([]);
    });

    it("stops ticking and stops rescheduling after stop", () => {
      const h = createHarness();
      h.clock.start();
      h.tick(OVER_BUDGET);
      expect(h.ticks).toHaveLength(1);

      h.clock.stop();
      expect(h.clock.running).toBe(false);

      h.tick(OVER_BUDGET);
      expect(h.ticks).toHaveLength(1);
      // The stopped loop returns before requesting another frame
      expect(h.queued()).toBe(0);
    });
  });

  describe("frame budget", () => {
    it("ticks once more than a frame's worth of time has passed", () => {
      const h = createHarness();
      h.clock.start();
      h.tick(OVER_BUDGET);
      expect(h.ticks).toEqual([OVER_BUDGET]);
    });

    it("skips the tick when less than a frame's worth has passed", () => {
      const h = createHarness();
      h.clock.start();
      h.tick(UNDER_BUDGET);
      expect(h.ticks).toEqual([]);
    });

    it("keeps scheduling frames even while skipping ticks", () => {
      const h = createHarness();
      h.clock.start();
      h.tick(UNDER_BUDGET);
      expect(h.ticks).toEqual([]);
      expect(h.queued()).toBe(1);
    });

    it("accumulates skipped time into the next tick", () => {
      const h = createHarness();
      h.clock.start();
      h.tick(UNDER_BUDGET); // skipped, prevTime not advanced
      h.tick(UNDER_BUDGET); // now 0.02 since prevTime, over budget
      expect(h.ticks).toHaveLength(1);
      expect(h.ticks[0]).toBeCloseTo(UNDER_BUDGET * 2, 10);
    });

    it("honours a raised maxFPS", () => {
      const h = createHarness();
      h.clock.maxFPS = 1000; // budget 0.001s
      h.clock.start();
      h.tick(0.002);
      expect(h.ticks).toHaveLength(1);
    });

    it("honours a lowered maxFPS", () => {
      const h = createHarness();
      h.clock.maxFPS = 10; // budget 0.1s
      h.clock.start();
      h.tick(OVER_BUDGET); // 0.02 -- fine at 60fps, too soon at 10fps
      expect(h.ticks).toEqual([]);
      h.tick(0.09); // 0.11 total
      expect(h.ticks).toHaveLength(1);
    });

    // `maxFPS = 0` is deliberately NOT covered here. It is documented as
    // "no limit", but `1 / 0` is Infinity and nothing is ever greater than
    // Infinity, so it currently freezes the clock completely. Asserting
    // either way would be wrong: the current behaviour is a bug, and the
    // documented behaviour doesn't exist yet. Tracked separately.
  });

  describe("speed", () => {
    it("defaults to real time", () => {
      const h = createHarness();
      h.clock.start();
      h.tick(OVER_BUDGET);
      expect(h.clock.deltaTime).toBe(OVER_BUDGET);
    });

    it("scales the delta", () => {
      const h = createHarness();
      h.clock.speed = 2;
      h.clock.start();
      h.tick(OVER_BUDGET);
      expect(h.clock.deltaTime).toBeCloseTo(OVER_BUDGET * 2, 10);
    });

    // Speed 0 is how the game pauses: callbacks keep arriving (so managers can
    // still render) but no game time passes.
    it("freezes time at speed 0 while still ticking", () => {
      const h = createHarness();
      h.clock.speed = 0;
      h.clock.start();
      h.tick(OVER_BUDGET);

      expect(h.ticks).toHaveLength(1);
      expect(h.clock.deltaTime).toBe(0);
      expect(h.clock.elapsedTime).toBe(0);
      expect(h.clock.elapsedFrames).toBe(0);
    });

    it("resumes accumulating when speed is restored", () => {
      const h = createHarness();
      h.clock.speed = 0;
      h.clock.start();
      h.tick(OVER_BUDGET);
      expect(h.clock.elapsedFrames).toBe(0);

      h.clock.speed = 1;
      h.tick(OVER_BUDGET);
      expect(h.clock.elapsedFrames).toBe(1);
      expect(h.clock.elapsedTime).toBeCloseTo(OVER_BUDGET, 10);
    });
  });

  describe("derived readings", () => {
    it("reports the delta in milliseconds", () => {
      const h = createHarness();
      h.clock.start();
      h.tick(OVER_BUDGET);
      expect(h.clock.deltaMS).toBeCloseTo(20, 10);
    });

    it("reports the delta in frames", () => {
      const h = createHarness();
      h.clock.start();
      h.tick(1); // a full second
      expect(h.clock.deltaFrames).toBe(60);
    });

    it("accumulates elapsed time and frames", () => {
      const h = createHarness();
      h.clock.start();
      h.tick(OVER_BUDGET);
      h.tick(OVER_BUDGET);
      expect(h.clock.elapsedFrames).toBe(2);
      expect(h.clock.elapsedTime).toBeCloseTo(0.04, 10);
    });

    it("reports the average frame rate", () => {
      const h = createHarness();
      h.clock.start();
      h.tick(OVER_BUDGET);
      h.tick(OVER_BUDGET);
      // 2 frames across 0.04s -> 50fps
      expect(h.clock.currentFPS).toBeCloseTo(50, 10);
    });
  });

  describe("callbacks", () => {
    it("passes the clock to the callback", () => {
      const h = createHarness();
      const seen: Clock[] = [];
      h.clock.add((c) => seen.push(c));
      h.clock.start();
      h.tick(OVER_BUDGET);
      expect(seen).toEqual([h.clock]);
    });

    it("runs every registered callback", () => {
      const h = createHarness();
      let a = 0;
      let b = 0;
      h.clock.add(() => (a += 1));
      h.clock.add(() => (b += 1));
      h.clock.start();
      h.tick(OVER_BUDGET);
      expect([a, b]).toEqual([1, 1]);
    });

    it("registers a given callback only once", () => {
      const h = createHarness();
      let calls = 0;
      const callback = () => (calls += 1);
      h.clock.add(callback);
      h.clock.add(callback);
      h.clock.start();
      h.tick(OVER_BUDGET);
      expect(calls).toBe(1);
    });

    it("stops running a removed callback", () => {
      const h = createHarness();
      let calls = 0;
      const callback = () => (calls += 1);
      h.clock.add(callback);
      h.clock.start();
      h.tick(OVER_BUDGET);
      expect(calls).toBe(1);

      h.clock.remove(callback);
      h.tick(OVER_BUDGET);
      expect(calls).toBe(1);
    });

    it("drops every callback on dispose", () => {
      const h = createHarness();
      h.clock.start();
      h.clock.dispose();
      h.tick(OVER_BUDGET);
      expect(h.ticks).toEqual([]);
    });
  });

  describe("adjustTime", () => {
    // Skipping the clock forward must not look like a giant frame: the offset
    // moves the anchors too, so the next delta is unchanged.
    it("does not inflate the next delta", () => {
      const h = createHarness();
      h.clock.start();
      h.clock.adjustTime(100);
      h.tick(OVER_BUDGET);
      expectOneTick(h.ticks, OVER_BUDGET);
    });

    it("shifts the reported start time", () => {
      const h = createHarness();
      h.clock.start();
      const before = h.clock.startTime;
      h.clock.adjustTime(5);
      expect(h.clock.startTime).toBe(before + 5);
    });

    it("accepts negative adjustments", () => {
      const h = createHarness(100);
      h.clock.start();
      h.clock.adjustTime(-10);
      h.tick(OVER_BUDGET);
      expectOneTick(h.ticks, OVER_BUDGET);
    });
  });

  describe("syncToClock", () => {
    // The player swaps to the AudioContext's clock once audio is available.
    // Switching sources must not produce a jump, however far apart the two
    // sources' origins are.
    it("does not produce a jump when switching sources", () => {
      const h = createHarness(1000);
      h.clock.start();

      let audioNow = 0.5;
      h.clock.syncToClock({
        get currentTime() {
          return audioNow;
        },
      });

      audioNow += OVER_BUDGET;
      h.frame();

      expectOneTick(h.ticks, OVER_BUDGET);
    });

    it("keeps advancing on the new source afterwards", () => {
      const h = createHarness(1000);
      h.clock.start();

      let audioNow = 0.5;
      h.clock.syncToClock({
        get currentTime() {
          return audioNow;
        },
      });

      audioNow += OVER_BUDGET;
      h.frame();
      audioNow += OVER_BUDGET;
      h.frame();

      expect(h.ticks).toHaveLength(2);
      expect(h.clock.elapsedTime).toBeCloseTo(0.04, 10);
    });
  });
});

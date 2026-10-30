import { describe, expect, it } from "vitest";
import { Clock } from "./Clock";

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
    queued: () => pending.length,
    tick(seconds: number) {
      now += seconds;
      pending.shift()?.();
    },
    frame() {
      pending.shift()?.();
    },
    now: () => now,
    setNow(seconds: number) {
      now = seconds;
    },
  };
};

const OVER_BUDGET = 0.02;
const UNDER_BUDGET = 0.01;

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
      h.tick(UNDER_BUDGET);
      h.tick(UNDER_BUDGET);
      expect(h.ticks).toHaveLength(1);
      expect(h.ticks[0]).toBeCloseTo(UNDER_BUDGET * 2, 10);
    });

    it("honours a raised maxFPS", () => {
      const h = createHarness();
      h.clock.maxFPS = 1000;
      h.clock.start();
      h.tick(0.002);
      expect(h.ticks).toHaveLength(1);
    });

    it("honours a lowered maxFPS", () => {
      const h = createHarness();
      h.clock.maxFPS = 10;
      h.clock.start();
      h.tick(OVER_BUDGET);
      expect(h.ticks).toEqual([]);
      h.tick(0.09);
      expect(h.ticks).toHaveLength(1);
    });

    it("removes the limit at maxFPS 0", () => {
      const h = createHarness();
      h.clock.maxFPS = 0;
      h.clock.start();
      h.tick(0.0001);
      expectOneTick(h.ticks, 0.0001);
    });

    it("still does not tick when no time has passed at maxFPS 0", () => {
      const h = createHarness();
      h.clock.maxFPS = 0;
      h.clock.start();
      h.frame();
      expect(h.ticks).toEqual([]);
    });

    it("treats a negative maxFPS as unlimited too", () => {
      const h = createHarness();
      h.clock.maxFPS = -1;
      h.clock.start();
      h.tick(0.0001);
      expectOneTick(h.ticks, 0.0001);
    });

    it("keeps accumulating across many small frames at maxFPS 0", () => {
      const h = createHarness();
      h.clock.maxFPS = 0;
      h.clock.start();
      for (let i = 0; i < 10; i += 1) {
        h.tick(0.001);
      }
      expect(h.clock.elapsedFrames).toBe(10);
      expect(h.clock.elapsedTime).toBeCloseTo(0.01, 10);
    });
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
      h.tick(1);
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

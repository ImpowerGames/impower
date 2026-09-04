import { describe, expect, test } from "vitest";
import { Clock, ClockSource } from "../../game/core/classes/Clock";

class FakeClock implements ClockSource {
  private _time: number;
  constructor(time: number) {
    this._time = time;
  }
  get currentTime() {
    return this._time;
  }
  advance(seconds: number) {
    this._time += seconds;
  }
}

const noopFrame = () => 0;

describe("Clock.syncToClock preserves effective time", () => {
  test("re-syncing to the same source keeps getCurrentTime unchanged", () => {
    const source = new FakeClock(10);
    const clock = new Clock(source, noopFrame);

    const timeBefore = (clock as any).getCurrentTime();
    clock.syncToClock(source);
    const timeAfter = (clock as any).getCurrentTime();

    expect(timeAfter).toBeCloseTo(timeBefore, 10);
  });

  test("syncing to a new source with a different raw time preserves effective time", () => {
    const oldSource = new FakeClock(100);
    const clock = new Clock(oldSource, noopFrame);

    const timeBefore = (clock as any).getCurrentTime();

    const newSource = new FakeClock(5);
    clock.syncToClock(newSource);
    const timeAfter = (clock as any).getCurrentTime();

    expect(timeAfter).toBeCloseTo(timeBefore, 10);
  });

  test("a non-zero offset survives a re-sync to the same source", () => {
    const perfClock = new FakeClock(50);
    const clock = new Clock(perfClock, noopFrame);

    const audioClock = new FakeClock(3);
    clock.syncToClock(audioClock);

    const offset = (clock as any)._timeOffset as number;
    expect(offset).toBeCloseTo(50 - 3, 10);

    clock.syncToClock(audioClock);

    const offsetAfter = (clock as any)._timeOffset as number;
    expect(offsetAfter).toBeCloseTo(offset, 10);
  });

  test("the frame loop still ticks after a re-sync to the same source", () => {
    const source = new FakeClock(10);
    let frameCallback: (() => void) | undefined;
    const requestFrame = (cb: () => void) => {
      frameCallback = cb;
      return 0;
    };

    const clock = new Clock(source, requestFrame);
    clock.maxFPS = 60;

    let tickCount = 0;
    clock.add(() => {
      tickCount += 1;
    });

    clock.start();
    expect(tickCount).toBe(0);

    const audioClock = new FakeClock(2);
    clock.syncToClock(audioClock);

    clock.syncToClock(audioClock);

    audioClock.advance(1 / 30);
    frameCallback?.();

    expect(tickCount).toBeGreaterThan(0);
  });

  test("effective time never jumps backward on re-sync", () => {
    const perfClock = new FakeClock(100);
    const clock = new Clock(perfClock, noopFrame);

    const audioClock = new FakeClock(1);
    clock.syncToClock(audioClock);

    const timeAfterFirstSync = (clock as any).getCurrentTime();
    expect(timeAfterFirstSync).toBeCloseTo(100, 10);

    audioClock.advance(0.5);

    clock.syncToClock(audioClock);

    const timeAfterResync = (clock as any).getCurrentTime();
    expect(timeAfterResync).toBeGreaterThanOrEqual(timeAfterFirstSync);
    expect(timeAfterResync).toBeCloseTo(100.5, 10);
  });
});

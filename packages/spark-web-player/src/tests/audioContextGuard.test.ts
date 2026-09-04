import { describe, expect, test, vi } from "vitest";
import { Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import { Application } from "../app/Application";

// Issue #394: the first click in play mode froze the game for seconds because
// the audio-context handler called setAudioContext with the context already in
// use, which re-synced the clock and zeroed the time offset. The guard added
// to setAudioContext prevents the redundant re-sync.

const setAudioContext = Application.prototype.setAudioContext;

function fakeApp(clock: Clock) {
  return { _audioContext: undefined as any, _clock: clock };
}

function fakeAudioContext(currentTime: number) {
  return { state: "running" as const, currentTime };
}

describe("Application.setAudioContext identity guard (#394)", () => {
  test("calling with the same context twice does not re-sync the clock", () => {
    const source = { currentTime: 0 };
    const clock = new Clock(source, () => 0);
    const syncSpy = vi.spyOn(clock, "syncToClock");

    const ctx = fakeAudioContext(5);
    const app = fakeApp(clock);

    setAudioContext.call(app, ctx);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(app._audioContext).toBe(ctx);

    setAudioContext.call(app, ctx);
    expect(syncSpy).toHaveBeenCalledTimes(1);
  });

  test("calling with a different context does re-sync", () => {
    const source = { currentTime: 0 };
    const clock = new Clock(source, () => 0);
    const syncSpy = vi.spyOn(clock, "syncToClock");

    const ctx1 = fakeAudioContext(5);
    const ctx2 = fakeAudioContext(8);
    const app = fakeApp(clock);

    setAudioContext.call(app, ctx1);
    expect(syncSpy).toHaveBeenCalledTimes(1);

    setAudioContext.call(app, ctx2);
    expect(syncSpy).toHaveBeenCalledTimes(2);
  });

  test("the clock's next delta stays positive after a same-context call", () => {
    const source = { currentTime: 0 };
    let tickCount = 0;
    const clock = new Clock(source, () => 0);
    clock.add(() => { tickCount += 1; });
    clock.start();

    const ctx = fakeAudioContext(8);
    const app = fakeApp(clock);

    source.currentTime = 2;
    setAudioContext.call(app, ctx);

    ctx.currentTime = 8.5;
    setAudioContext.call(app, ctx);

    tickCount = 0;
    (clock as any).loop();
    expect(tickCount).toBeGreaterThan(0);
  });

  test("a non-running context is ignored entirely", () => {
    const source = { currentTime: 0 };
    const clock = new Clock(source, () => 0);
    const syncSpy = vi.spyOn(clock, "syncToClock");

    const ctx = { state: "suspended" as const, currentTime: 5 };
    const app = fakeApp(clock);

    setAudioContext.call(app, ctx);
    expect(syncSpy).not.toHaveBeenCalled();
    expect(app._audioContext).toBeUndefined();
  });
});

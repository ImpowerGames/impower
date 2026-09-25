// An application tears down once, after it has finished initializing, and
// every caller of `destroy` waits for that teardown: the controller builds the
// next application only once the last one has let go of the page. A failed
// initialization is finished too, so its application can still be torn down
// and a later PLAY can build its own. And the editor can step its clock
// while it initializes: the clock moves, and nothing is drawn yet.
//
// These run `Application`'s own methods on an instance whose renderer,
// managers and connection are stand-ins.

import { describe, expect, test } from "vitest";
import { Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import { Application } from "../app/Application";

/** An application whose initialization steps are `steps`, and a count of
 *  its managers' teardowns. */
function application(steps: {
  renderer?: () => Promise<void>;
  connect?: () => Promise<void>;
}) {
  const disposed = { count: 0 };
  const app = Object.create(Application.prototype) as Application;
  Object.assign(app, {
    _previewing: false,
    _managers: [{ onDispose: () => (disposed.count += 1) }],
    _router: { disconnect: () => {} },
    _clock: { dispose: () => {} },
    _resizeObserver: { disconnect: () => {} },
    unbind: () => {},
    initializeRenderer: steps.renderer ?? (async () => {}),
    initializeManagers: async () => {},
    connectGame: steps.connect ?? (async () => {}),
  });
  return { app, disposed };
}

/** A promise a test settles when it is ready. */
const gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
};

/** Whether `work` has settled once everything already queued has run. */
const settled = async (work: Promise<unknown>) => {
  let done = false;
  work.then(
    () => (done = true),
    () => (done = true),
  );
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return done;
};

describe("Application.destroy", () => {
  test("a second call waits for the teardown the first began", async () => {
    const connecting = gate();
    const { app, disposed } = application({ connect: () => connecting.opened });
    const initialized = app.init();

    const first = app.destroy(true);
    const second = app.destroy(true);
    expect(app.destroyed).toBe(true);
    expect(await settled(second)).toBe(false);

    connecting.open();
    await initialized;
    await Promise.all([first, second]);
    expect(disposed.count).toBe(1);
  });

  test("tears down an application whose initialization failed", async () => {
    const { app, disposed } = application({
      renderer: () => Promise.reject(new Error("no WebGL")),
    });
    await expect(app.init()).rejects.toThrow("no WebGL");

    expect(await settled(app.destroy(true))).toBe(true);
    expect(disposed.count).toBe(1);
  });
});

describe("Application.skip", () => {
  test("a clock step before the renderer has initialized moves the clock without drawing", () => {
    const clock = new Clock({ currentTime: 0 }, () => 0);
    const skipped: number[] = [];
    const app = Object.create(Application.prototype) as Application;
    Object.assign(app, {
      _clock: clock,
      _managers: [{ onSkip: (seconds: number) => skipped.push(seconds), onUpdate: () => {} }],
      _renderer: {
        render: () => {
          throw new Error("the renderer has no view yet");
        },
      },
      _initialized: false,
    });

    app.skip(2.5);

    expect(skipped).toEqual([2.5]);
    expect((clock as any)._timeOffset).toBeCloseTo(2.5, 9);
  });
});

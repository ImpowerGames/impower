import { afterEach, describe, expect, test, vi } from "vitest";
import UIManager from "../../src/app/managers/UIManager";
import { createStubApp, installJSDOM } from "./domTestHarness";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
});

async function setup(browserTimeline: boolean) {
  const { overlay, win, restore } = installJSDOM();
  const app = createStubApp(overlay, () => {});
  (app as unknown as { answer: () => void }).answer = () => {};
  const ui = new UIManager(app);
  await ui.onInit();
  const frame = 1000;
  if (browserTimeline) {
    class DocumentTimeline {
      currentTime = frame;
    }
    Object.defineProperty(win, "DocumentTimeline", { configurable: true, value: DocumentTimeline });
    Object.defineProperty(win.document, "timeline", { configurable: true, value: new DocumentTimeline() });
  } else {
    Object.defineProperty(win.document, "timeline", { configurable: true, value: { currentTime: frame } });
  }
  vi.spyOn(win.performance, "now").mockReturnValue(frame + 35);
  const delays: number[] = [];
  const schedule = vi.spyOn(globalThis, "setTimeout").mockImplementation(((_handler: () => void, delay?: number) => {
    delays.push(delay ?? 0);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
  const pending = { params: { messages: [] }, ops: [], plan: new Map(), at: frame + 62, lag: 0, owner: ui };
  (overlay as HTMLElement & { __sdBeat?: unknown }).__sdBeat = pending;
  cleanups.push(restore, () => {
    schedule.mockRestore();
    delete (overlay as HTMLElement & { __sdBeat?: unknown }).__sdBeat;
    ui.onDispose();
    win.close();
  });
  return { ui: ui as unknown as { scheduleCommit: () => void }, delays };
}

describe("a beat drawn before it is due fires when it is due, not a frame-time's lag later (#2813)", () => {
  test("in a browser, the commit timer runs from the current time, not from the last frame's time", async () => {
    const t = await setup(true);
    t.ui.scheduleCommit();
    expect(t.delays).toEqual([27]);
  });

  test("where the document has no browser timeline, the timer runs from the timeline's time as before", async () => {
    const t = await setup(false);
    t.ui.scheduleCommit();
    expect(t.delays).toEqual([62]);
  });
});

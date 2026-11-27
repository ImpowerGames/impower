import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const DONE = "scene start\n  Hello.\n  done\nend\n";
const FIN = "scene start\n  Hello.\n  fin\nend\n";
const ERROR = 'scene start\n  Hello.\n  & error("boom")\n  Goodbye.\nend\n';

const shownFrame = (h: any) => {
  const copy = h.overlay.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("style").forEach((style) => style.remove());
  const indicator = h.overlay.querySelector(".continue_indicator") as HTMLElement | null;
  const badge = h.bar("#ending-status");
  return {
    text: copy.textContent ?? "",
    indicatorHidden: indicator?.style.display === "none",
    endMark: h.overlay.querySelector(".end_mark") !== null,
    badge: badge.hidden ? null : badge.textContent,
  };
};

const playFrom = async (source: string, line: number) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: source }],
    startFrom: { file: MAIN_URI, line },
    manualClock: true,
  });
  const doc = h.overlay.ownerDocument;
  const win = doc.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  h.refs.toolbar = doc.createElement("div");
  await h.compile();
  await h.select(line);
  await settle(40);
  expect(await h.controller.startGameAndApp()).toBe(true);
  await settle(40);
  await h.tick(1000 / 60, 60);
  return h;
};

const click = async (h: any) => {
  h.controller._app.emit(
    EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
  );
  await settle(10);
  await h.tick(1000 / 60, 60);
  await settle(20);
};

const ended = (h: any) =>
  h.toEditor.filter((m: any) => m.method === "game/ended").map((m: any) => m.params);

describe("STOP from an ended PLAY lands on the preview of the line the run ended on", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["running out", DONE, 1, 2, "Story ran out", false],
    ["fin", FIN, 1, 2, "End of story", true],
    ["a runtime error", ERROR, 1, 2, "Stopped by an error", false],
    ["running out from PLAY started on the done line", DONE, 2, 2, "Story ran out", false],
  ] as const)(
    "after %s, the frame and badge are the preview's at that line",
    async (_name, source, from, endLine, badge, endMark) => {
      const h = await playFrom(source, from);
      try {
        await click(h);
        await click(h);
        const [ending] = ended(h);
        expect(ending).toBeDefined();
        const at = ending.error?.location ?? ending.location;
        expect(at?.range.start.line).toBe(endLine);
        h.workspace.selections.length = 0;
        await h.controller.handleStopGame({ id: 1, params: {} });
        await settle(40);
        expect(h.controller.playing).toBe(false);
        expect(h.workspace.selections.map((s: any) => s.selectedRange.start.line)).toEqual([
          endLine,
        ]);
        const stopped = shownFrame(h);
        expect(stopped.text).toContain("Hello.");
        expect(stopped.indicatorHidden).toBe(true);
        expect(stopped.endMark).toBe(endMark);
        expect(stopped.badge).toBe(badge);
        await h.select(endLine);
        await settle(40);
        expect(shownFrame(h)).toEqual(stopped);
      } finally {
        h.dispose();
      }
    },
    120_000,
  );
});

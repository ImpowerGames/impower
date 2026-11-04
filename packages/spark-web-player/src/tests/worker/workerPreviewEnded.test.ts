import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const DONE = "scene start(x)\n  Hello.\n  done\nend\n";
const FIN = "scene start\n  Hello.\n  fin\nend\n";
const CONTENT = "scene start\n  Hello.\n  Goodbye.\nend\n";
const ERROR = 'scene start\n  Hello.\n  & error("boom")\n  Goodbye.\nend\n';

const open = async (source: string) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: source }],
    startFrom: { file: MAIN_URI, line: 0 },
  });
  h.refs.endingStatus = h.overlay.ownerDocument.createElement("span");
  h.refs.endingStatus.hidden = true;
  await h.compile();
  return h;
};

const shownText = (overlay: HTMLElement) => {
  const copy = overlay.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("style").forEach((style) => style.remove());
  return copy.textContent ?? "";
};

const previewAt = async (h: any, line: number) => {
  await h.select(line);
  await settle(40);
  const indicator = h.overlay.querySelector(".continue_indicator") as HTMLElement | null;
  const badge = h.refs.endingStatus as HTMLElement;
  return {
    text: shownText(h.overlay),
    indicatorHidden: indicator?.style.display === "none",
    endMark: h.overlay.querySelector(".end_mark") !== null,
    badge: badge.hidden ? null : badge.textContent,
    kind: badge.getAttribute("kind"),
    hover: badge.title,
  };
};

describe("the preview at a line where the run ends", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["a done with nothing left to run", DONE, 2, "Hello.", 3],
    ["the closing end of a flow that nothing follows", DONE, 3, "Hello.", 3],
    ["the closing end at the end of the content", CONTENT, 3, "Goodbye.", 4],
    ["the blank line after the content", CONTENT, 4, "Goodbye.", 4],
  ])(
    "at %s, shows the last beat without the continue indicator and the ran-out badge",
    async (_name, source, line, shown, after) => {
      const h = await open(source);
      try {
        const frame = await previewAt(h, line);
        expect(frame.text).toContain(shown);
        expect(frame.indicatorHidden).toBe(true);
        expect(frame.endMark).toBe(false);
        expect(frame.badge).toBe("Story ran out");
        expect(frame.kind).toBe("out");
        expect(frame.hover).toBe(
          `Nothing runs after line ${after}. End the story with fin to show the ending screen.`,
        );
      } finally {
        h.dispose();
      }
    },
    120_000,
  );

  it("at a fin, shows the last beat with the ending screen at rest and the end-of-story badge", async () => {
    const h = await open(FIN);
    try {
      const frame = await previewAt(h, 2);
      expect(frame.text).toContain("Hello.");
      expect(frame.indicatorHidden).toBe(true);
      expect(frame.endMark).toBe(true);
      expect(frame.badge).toBe("End of story");
      expect(frame.kind).toBe("fin");
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("at a line that raises a runtime error, shows the last beat and the error badge", async () => {
    const h = await open(ERROR);
    try {
      const frame = await previewAt(h, 2);
      expect(frame.text).toContain("Hello.");
      expect(frame.text).not.toContain("Goodbye.");
      expect(frame.indicatorHidden).toBe(true);
      expect(frame.endMark).toBe(false);
      expect(frame.badge).toBe("Stopped by an error");
      expect(frame.kind).toBe("error");
      expect(frame.hover).toMatch(/boom.*\(line 3\)$/);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it.each([
    ["a run that ends with done", DONE],
    ["a run that ends with fin", FIN],
  ])(
    "at the last beat's own line of %s, keeps the continue indicator and shows no badge",
    async (_name, source) => {
      const h = await open(source);
      try {
        const frame = await previewAt(h, 1);
        expect(frame.text).toContain("Hello.");
        expect(frame.indicatorHidden).toBe(false);
        expect(frame.endMark).toBe(false);
        expect(frame.badge).toBeNull();
      } finally {
        h.dispose();
      }
    },
    120_000,
  );

  it("going back from an ending line to the last beat's line restores the continue indicator and clears the ending", async () => {
    const h = await open(FIN);
    try {
      expect((await previewAt(h, 2)).endMark).toBe(true);
      const back = await previewAt(h, 1);
      expect(back.indicatorHidden).toBe(false);
      expect(back.endMark).toBe(false);
      expect(back.badge).toBeNull();
      const again = await previewAt(h, 2);
      expect(again.indicatorHidden).toBe(true);
      expect(again.endMark).toBe(true);
      expect(again.badge).toBe("End of story");
    } finally {
      h.dispose();
    }
  }, 120_000);
});

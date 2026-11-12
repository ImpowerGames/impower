import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `define a as image with
  src = "https://example.com/a.png"
end

scene start
  HERO:
    [[a]]
    The first line.

  HERO:
    [[a]]
    The second line.

  HERO:
    The third line.
end
`;

const GOLD = `define a as image with
  src = "https://example.com/a.png"
end

store gold = 0

scene start
  & gold = gold + 5
  HERO:
    [[a]]
    The first line.

  HERO:
    [[a]]
    The second line. You have {gold} gold.

  HERO:
    The third line.
end
`;

const shownText = (overlay: HTMLElement) =>
  [...overlay.querySelectorAll(".dialogue .text_letter")]
    .map((letter) => letter.textContent)
    .join("");

const lineOf = (source: string, text: string) =>
  source.split("\n").findIndex((l) => l.includes(text));

interface Sample {
  letters: number;
  portraits: number;
}

const watchFrames = (overlay: HTMLElement) => {
  const win = overlay.ownerDocument.defaultView as any;
  const samples: Sample[] = [];
  let due = false;
  const sample = () => {
    due = false;
    samples.push({
      letters: overlay.querySelectorAll(".dialogue .text_letter").length,
      portraits: overlay.querySelectorAll(".portrait .instance[image]").length,
    });
  };
  const observer = new win.MutationObserver(() => {
    if (!due) {
      due = true;
      setTimeout(sample, 0);
    }
  });
  observer.observe(overlay, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  sample();
  return {
    samples,
    stop: () => observer.disconnect(),
  };
};

const emptyRuns = (samples: Sample[]): number[] => {
  const runs: number[] = [];
  let run = 0;
  for (const s of samples) {
    if (s.letters === 0 && s.portraits === 0) {
      run += 1;
    } else if (run > 0) {
      runs.push(run);
      run = 0;
    }
  }
  if (run > 0) {
    runs.push(run);
  }
  return runs;
};

const restarted = async (h: { toEditor: any[] }, before: number) => {
  for (let i = 0; i < 200; i++) {
    if (h.toEditor.filter((m) => m.method === "game/reloaded").length > before) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("The game never restarted");
};

const playing = async (source = SOURCE) => {
  const second = lineOf(source, "The second line.");
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: source }],
    startFrom: { file: MAIN_URI, line: second },
    manualClock: true,
  });
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  await h.compile();
  await h.select(second);
  await settle(40);
  expect(await h.controller.startGameAndApp()).toBe(true);
  await settle(40);
  await h.tick(1000 / 60, 120);
  const editAndWatch = async (text: string, from: string, to: string) => {
    const lines = source.split("\n");
    const line = lineOf(source, text);
    const character = lines[line]!.indexOf(from);
    const frames = watchFrames(h.overlay);
    const reloads = h.toEditor.filter((m) => m.method === "game/reloaded").length;
    await h.edit([
      {
        range: {
          start: { line, character },
          end: { line, character: character + from.length },
        },
        text: to,
      },
    ]);
    await h.compile();
    await restarted(h, reloads);
    await settle(40);
    await h.tick(1000 / 60, 120);
    frames.stop();
    return frames.samples;
  };
  return { h, editAndWatch };
};

describe("an edit during PLAY keeps the line and its portrait on screen (#2117)", () => {
  it("shows the line and portrait before the edit", async () => {
    const { h } = await playing();
    try {
      expect(
        h.overlay.querySelectorAll(".dialogue .text_letter").length,
      ).toBeGreaterThan(0);
      expect(
        h.overlay.querySelectorAll(".portrait .instance[image]").length,
      ).toBeGreaterThan(0);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("never empties the screen when an edit below leaves the line unchanged", async () => {
    const { h, editAndWatch } = await playing();
    try {
      const samples = await editAndWatch("The third line.", "third", "last");
      expect(samples.length).toBeGreaterThan(1);
      expect(emptyRuns(samples)).toEqual([]);
      expect(samples.at(-1)!.letters).toBeGreaterThan(0);
      expect(samples.at(-1)!.portraits).toBeGreaterThan(0);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("never empties the screen when an edit above leaves the line unchanged", async () => {
    const { h, editAndWatch } = await playing();
    try {
      const samples = await editAndWatch("The first line.", "first", "opening");
      expect(emptyRuns(samples)).toEqual([]);
      expect(samples.at(-1)!.letters).toBeGreaterThan(0);
      expect(samples.at(-1)!.portraits).toBeGreaterThan(0);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("shows the restarted run's value, not the old run's, for a variable changed before the edit", async () => {
    const { h, editAndWatch } = await playing(GOLD);
    try {
      expect(shownText(h.overlay)).toContain("You have 5 gold.");
      const unchanged = await editAndWatch("The third line.", "third", "last");
      expect(emptyRuns(unchanged)).toEqual([]);
      expect(shownText(h.overlay)).toContain("You have 5 gold.");
      const changed = await editAndWatch("& gold = gold + 5", "5", "7");
      expect(emptyRuns(changed).every((run) => run <= 1)).toBe(true);
      expect(shownText(h.overlay)).toContain("You have 7 gold.");
      expect(shownText(h.overlay)).not.toContain("5");
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("empties the screen for at most one frame when the edit changes the line", async () => {
    const { h, editAndWatch } = await playing();
    try {
      const samples = await editAndWatch("The second line.", "second", "middle");
      expect(emptyRuns(samples).every((run) => run <= 1)).toBe(true);
      expect(samples.at(-1)!.letters).toBeGreaterThan(0);
      expect(samples.at(-1)!.portraits).toBeGreaterThan(0);
    } finally {
      h.dispose();
    }
  }, 120_000);
});

import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle, writtenText } from "./playerHarness";
import { playFrom, previewAt } from "./playFromLine";

const SCENES = `store visits = 0

scene start
  Inside start.
end

const limit = 3

scene other
  Inside other.
end

`;

const UNCLOSED = `scene start
  Inside start.
end

scene other
  Inside other.

`;

const OUTSIDE = [
  ["a declaration above the first scene", 0],
  ["a blank line above the first scene", 1],
  ["a blank line after a scene's end", 5],
  ["a declaration between scenes", 6],
  ["a blank line above the next scene", 7],
  ["the blank line after the last scene", 11],
] as const;

const SHOWN = ["Inside start.", "Inside other."];

describe("the preview at a line outside every scene", () => {
  it.each(OUTSIDE)("at %s, shows no scene's beat", async (_name, line) => {
    const text = await previewAt(SCENES, line);
    for (const beat of SHOWN) {
      expect(text).not.toContain(beat);
    }
  }, 120_000);

  it("clears the beat, the continue indicator and the route a scene left on screen when the cursor leaves the scene", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SCENES }],
      startFrom: { file: MAIN_URI, line: 9 },
    });
    h.refs.routeButton = h.overlay.ownerDocument.createElement("div");
    const indicatorShown = () => {
      const indicator = h.overlay.querySelector(".continue_indicator") as HTMLElement | null;
      return indicator !== null && indicator.style.display !== "none";
    };
    try {
      await h.compile();
      await h.select(9);
      await settle(40);
      expect(h.overlay.textContent).toContain("Inside other.");
      expect(indicatorShown()).toBe(true);
      expect(h.bar("#route-button").hidden).toBe(false);
      const before = h.toRouter.length;
      await h.select(11);
      await settle(40);
      expect(writtenText(h.toRouter.slice(before))).toBe("");
      expect(h.overlay.textContent).not.toContain("Inside other.");
      expect(indicatorShown()).toBe(false);
      expect(h.bar("#route-button").hidden).toBe(true);
      await h.select(3);
      await settle(40);
      expect(h.overlay.textContent).toContain("Inside start.");
      expect(indicatorShown()).toBe(true);
      expect(h.bar("#route-button").hidden).toBe(false);
    } finally {
      h.dispose();
    }
  }, 120_000);
});

describe("PLAY from a line outside every scene", () => {
  it.each(OUTSIDE)("from %s, starts no scene", async (_name, line) => {
    const outcome = await playFrom(SCENES, line);
    expect(outcome.started).toBe(false);
    expect(outcome.state).toBeUndefined();
    for (const beat of SHOWN) {
      expect(outcome.text).not.toContain(beat);
    }
  }, 120_000);
});

describe("lines inside a scene", () => {
  it.each([
    ["a scene's header", SCENES, 2, "Inside start."],
    ["a scene's beat", SCENES, 9, "Inside other."],
    ["a scene's closing end", SCENES, 10, "Inside other."],
    ["a blank line in a scene that is missing its end", UNCLOSED, 6, "Inside other."],
  ] as const)("at %s, preview and PLAY show the scene's beat", async (_name, source, line, shown) => {
    expect(await previewAt(source, line)).toContain(shown);
    if (source === SCENES) {
      const outcome = await playFrom(source, line);
      expect(outcome.started).toBe(true);
      expect(outcome.text).toContain(shown);
    }
  }, 120_000);
});

const WITH_UI = `define accent as color with value = "#13171f" end

style card {
  background_color = black
}

function bump(n)
  return n + 1
end

scene start
  Inside start.
end

scene other
  Inside other.
end

define --[[palette]] muted as color with value = "#333c4e" end
`;

const UI_LINES = [
  ["a define as color", 0],
  ["a style's header", 2],
  ["a style's property", 3],
  ["a define as color with a comment in its header", 18],
] as const;

describe("a line inside a top-level UI declaration", () => {
  it.each(UI_LINES)(
    "at %s, keeps showing the last previewed scene's beat",
    async (_name, line) => {
      const h = await createPlayerHarness({
        files: [{ uri: MAIN_URI, text: WITH_UI }],
        startFrom: { file: MAIN_URI, line: 15 },
      });
      h.refs.routeButton = h.overlay.ownerDocument.createElement("div");
      try {
        await h.compile();
        await h.select(15);
        await settle(40);
        expect(h.overlay.textContent).toContain("Inside other.");
        await h.select(line);
        await settle(40);
        expect(h.overlay.textContent).toContain("Inside other.");
        expect(h.bar("#route-button").hidden).toBe(false);
      } finally {
        h.dispose();
      }
    },
    120_000,
  );

  it.each(UI_LINES)(
    "at %s with no scene previewed yet, shows the start scene's first beat",
    async (_name, line) => {
      const text = await previewAt(WITH_UI, line);
      expect(text).toContain("Inside start.");
      expect(text).not.toContain("Inside other.");
    },
    120_000,
  );

  it.each(UI_LINES)("PLAY from %s starts no scene", async (_name, line) => {
    const outcome = await playFrom(WITH_UI, line);
    expect(outcome.started).toBe(false);
    expect(outcome.state).toBeUndefined();
  }, 120_000);

  it.each([
    ["inserting a line", { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, "\n", 2, 11, "Last other beat.", "First other beat."],
    ["deleting a line", { start: { line: 1, character: 0 }, end: { line: 2, character: 0 } }, "", 1, 10, "First other beat.", "Last other beat."],
  ] as const)(
    "keeps the same beat after %s inside the UI declaration above the scene",
    async (_name, range, text, cursor, kept, shown, other) => {
      const source = `style card {
  background_color = black
  color = white
}

scene start
  Inside start.
end

scene other
  First other beat.
  Last other beat.
end
`;
      const h = await createPlayerHarness({
        files: [{ uri: MAIN_URI, text: source }],
        startFrom: { file: MAIN_URI, line: kept },
      });
      try {
        await h.compile();
        await h.select(kept);
        await settle(40);
        expect(h.overlay.textContent).toContain(shown);
        expect(h.overlay.textContent).not.toContain(other);
        await h.select(1);
        await settle(40);
        expect(h.overlay.textContent).toContain(shown);
        await h.edit([{ range, text }]);
        await h.compile();
        await h.select(cursor);
        await settle(40);
        expect(h.overlay.textContent).toContain(shown);
        expect(h.overlay.textContent).not.toContain(other);
      } finally {
        h.dispose();
      }
    },
    120_000,
  );

  it("falls back to the start scene's first beat when the kept scene is renamed", async () => {
    const source = `style card {
  background_color = black
}

scene start
  Inside start.
end

scene other
  Inside other.
end
`;
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: source }],
      startFrom: { file: MAIN_URI, line: 9 },
    });
    try {
      await h.compile();
      await h.select(9);
      await settle(40);
      expect(h.overlay.textContent).toContain("Inside other.");
      await h.select(1);
      await settle(40);
      expect(h.overlay.textContent).toContain("Inside other.");
      await h.edit([
        { range: { start: { line: 8, character: 6 }, end: { line: 8, character: 11 } }, text: "renamed" },
      ]);
      await h.compile();
      await h.select(1);
      await settle(40);
      expect(h.overlay.textContent).toContain("Inside start.");
      expect(h.overlay.textContent).not.toContain("Inside other.");
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("a function's body, which is not a UI declaration, shows no scene's beat", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: WITH_UI }],
      startFrom: { file: MAIN_URI, line: 15 },
    });
    try {
      await h.compile();
      await h.select(15);
      await settle(40);
      expect(h.overlay.textContent).toContain("Inside other.");
      await h.select(7);
      await settle(40);
      expect(h.overlay.textContent).not.toContain("Inside other.");
      expect(h.overlay.textContent).not.toContain("Inside start.");
    } finally {
      h.dispose();
    }
  }, 120_000);
});

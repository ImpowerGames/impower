// The stopped preview displayed from the worker's game shows, after every
// compile, selection, edit and suggestion, the beat the step asks for.
//
// Each case runs the whole player through a sequence of steps and reads the
// serialized overlay after every one.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI } from "./playerHarness";

type Step =
  | { select: number }
  | { edit: { find: string; replace: string } }
  | { editAt: { offset: number; deleteLength: number; insert: string } }
  /** Highlight a suggestion that replaces `find` with `replace`, previewed at
   *  `line` (by default the edit's own line). */
  | { suggest: { find: string; replace: string; line?: number } }
  | { close: true };

const harnesses: { dispose(): void }[] = [];
afterEach(() => {
  for (const h of harnesses.splice(0)) h.dispose();
});

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

/** Run `steps` against `text`, and read the overlay after the first compile
 *  and after every step, with the line the toolbar says the preview
 *  launches from (`launches`). */
async function frames(text: string, steps: Step[]) {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text }],
    startFrom: { file: MAIN_URI, line: 0 },
  });
  harnesses.push(h);
  const out: unknown[] = [];
  const launches: string[] = [];
  const read = () => {
    out.push(h.snapshotDOM());
    launches.push(h.refs.launchLabel.textContent ?? "");
  };
  // A compile or selection the worker rejects is part of what is compared.
  const note = (answer: any) => {
    if (answer?.error) {
      out.push({ rejected: answer.error });
    }
  };
  note(await h.compile());
  read();
  let current = text;
  for (const step of steps) {
    if ("select" in step) {
      note(await h.select(step.select));
    } else if ("suggest" in step) {
      const offset = current.indexOf(step.suggest.find);
      expect(offset).toBeGreaterThanOrEqual(0);
      const range = {
        start: posAt(current, offset),
        end: posAt(current, offset + step.suggest.find.length),
      };
      await h.suggest([{ range, text: step.suggest.replace }], step.suggest.line ?? range.start.line);
    } else if ("close" in step) {
      await h.closeSuggestions();
    } else {
      const { offset, deleteLength, insert } =
        "edit" in step
          ? {
              offset: current.indexOf(step.edit.find),
              deleteLength: step.edit.find.length,
              insert: step.edit.replace,
            }
          : step.editAt;
      expect(offset).toBeGreaterThanOrEqual(0);
      await h.edit([
        {
          range: { start: posAt(current, offset), end: posAt(current, offset + deleteLength) },
          text: insert,
        },
      ]);
      current = current.slice(0, offset) + insert + current.slice(offset + deleteLength);
      note(await h.compile());
    }
    read();
  }
  return Object.assign(out, { launches });
}

/** Whether a frame shows `text`. */
const shows = (frame: unknown, text: string) => JSON.stringify(frame).includes(text);

function coupledScreenplay(): string {
  const L: string[] = [];
  L.push("define hero as character:");
  L.push(`  name = "Hero"`);
  L.push("");
  L.push("store trust = 0");
  L.push("");
  for (let s = 0; s < 6; s++) {
    L.push(`scene scene_${s}`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    L.push(`  Action describing room ${s}.`);
    L.push(`hero:`);
    L.push(`  Line one of dialogue in scene ${s}.`);
    L.push(`  Trust is {trust}.`);
    L.push("if trust > 2 then");
    L.push(`  hero: I trust you in scene ${s}.`);
    L.push("else");
    L.push(`  hero: Not yet in scene ${s}.`);
    L.push("end");
    L.push(`& trust = trust + 1`);
    L.push(`-> scene_${(s + 1) % 6}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

const lineOf = (text: string, find: string) => posAt(text, text.indexOf(find)).line;

describe("the preview displayed from the worker's game", () => {
  it("shows each step's beat over a screenplay, line by line and across edits", async () => {
    const text = coupledScreenplay();
    const steps: Step[] = [
      { select: lineOf(text, "Line one of dialogue in scene 0.") },
      { select: lineOf(text, "Not yet in scene 2.") },
      { select: lineOf(text, "Action describing room 4.") },
      { edit: { find: "Line one of dialogue in scene 4.", replace: "Line one, edited, in scene 4." } },
      { select: lineOf(text, "Trust is {trust}.") },
      { edit: { find: "store trust = 0", replace: "store trust = 5" } },
      { select: lineOf(text, "Line one of dialogue in scene 3.") },
    ];
    const on = await frames(text, steps);
    // Nothing was rejected, and each step shows its own beat.
    expect(on).toHaveLength(steps.length + 1);
    expect(shows(on[1], "Line one of dialogue in scene 0.")).toBe(true);
    expect(shows(on[2], "Not yet in scene 2.")).toBe(true);
    expect(shows(on[3], "Action describing room 4.")).toBe(true);
    // An edit on another line leaves the beat at the cursor on screen.
    expect(shows(on[4], "Action describing room 4.")).toBe(true);
    expect(shows(on[5], "Line one of dialogue in scene 0.")).toBe(true);
    expect(shows(on[5], "Trust is")).toBe(true);
    // An edit above the scene leaves its beat on screen.
    expect(shows(on[6], "Line one of dialogue in scene 0.")).toBe(true);
    expect(shows(on[7], "Line one of dialogue in scene 3.")).toBe(true);
  }, 120_000);

  it("shows each step's beat while suggestions are browsed, returned to and closed", async () => {
    const text = coupledScreenplay();
    const line = "Line one of dialogue in scene 2.";
    const steps: Step[] = [
      { select: lineOf(text, line) },
      { suggest: { find: line, replace: "A first suggestion for scene 2." } },
      { suggest: { find: line, replace: "A second suggestion for scene 2." } },
      // Back to the first, which the worker displays again from its kept story.
      { suggest: { find: line, replace: "A first suggestion for scene 2." } },
      { close: true },
      { select: lineOf(text, "Action describing room 5.") },
    ];
    const on = await frames(text, steps);
    expect(on).toHaveLength(steps.length + 1);
    expect(shows(on[1], line)).toBe(true);
    expect(shows(on[2], "A first suggestion for scene 2.")).toBe(true);
    expect(shows(on[3], "A second suggestion for scene 2.")).toBe(true);
    expect(shows(on[4], "A first suggestion for scene 2.")).toBe(true);
    // Closing the list shows the real document again.
    expect(shows(on[5], line)).toBe(true);
    expect(shows(on[5], "suggestion for scene 2.")).toBe(false);
    expect(shows(on[6], "Action describing room 5.")).toBe(true);
  }, 120_000);

  it("shows each step's beat while an image name is typed with the list open", async () => {
    const text = [
      `define SPRITE_A as image with`,
      `  src = "https://example.com/a.png"`,
      `end`,
      ``,
      `define SPRITE_B as image with`,
      `  src = "https://example.com/b.png"`,
      `end`,
      ``,
      `-> start`,
      ``,
      `scene start`,
      `  HERO:`,
      `    [[SPRITE_A]]`,
      `    The first line.`,
      ``,
      `  HERO:`,
      `    The second line.`,
      `end`,
      ``,
    ].join("\n");
    const second = "    The second line.";
    const steps: Step[] = [
      { select: lineOf(text, second) },
      // The author starts an image name that names nothing yet, with the
      // list open, so each keystroke compiles while a suggestion is shown.
      { edit: { find: second, replace: `    [[SPRITE\n${second}` } },
      { suggest: { find: "[[SPRITE\n", replace: "[[SPRITE_A]]\n" } },
      { edit: { find: "[[SPRITE\n", replace: "[[SPRITE_\n" } },
      { suggest: { find: "[[SPRITE_\n", replace: "[[SPRITE_A]]\n" } },
      { suggest: { find: "[[SPRITE_\n", replace: "[[SPRITE_B]]\n" } },
      { close: true },
    ];
    const on = await frames(text, steps);
    expect(on).toHaveLength(steps.length + 1);
    // Each keystroke's compile and each highlighted suggestion shows the
    // beat being typed into, with the picture the suggestion names.
    for (const frame of on.slice(1)) {
      expect(shows(frame, "The second line.")).toBe(true);
    }
    // Every frame names both images once for the assets it holds; a picture
    // on screen names its image again.
    const shown = (frame: unknown, image: string) =>
      JSON.stringify(frame).split(image).length - JSON.stringify(on[0]).split(image).length;
    expect(shown(on[3], "a.png")).toBeGreaterThan(0);
    expect(shown(on[6], "b.png")).toBeGreaterThan(0);
    // Closing the list shows the real document, whose name matches no image.
    expect(shown(on[7], "a.png")).toBe(0);
    expect(shown(on[7], "b.png")).toBe(0);
  }, 120_000);

  it("shows the real document after a suggestion changed a function an unchanged scene calls", async () => {
    // The suggestion compile carries `bridge` over unchanged and changes
    // `greeting`. Closing the list shows the real document from the story the
    // worker kept, without compiling, and the beat at the cursor calls
    // `greeting` from `bridge`: the call resolves through `bridge`'s parents
    // to the function of whichever story they lead to.
    const text = [
      "-> bridge",
      "",
      "function greeting()",
      `  return "the real greeting"`,
      "end",
      "",
      "scene bridge",
      "  The bridge says {greeting()}.",
      "end",
      "",
    ].join("\n");
    const steps: Step[] = [
      { select: lineOf(text, "The bridge says") },
      {
        suggest: {
          find: "the real greeting",
          replace: "the suggested greeting",
          line: lineOf(text, "The bridge says"),
        },
      },
      { close: true },
    ];
    const on = await frames(text, steps);
    expect(JSON.stringify(on[1])).toContain("The bridge says the real greeting.");
    expect(JSON.stringify(on[2])).toContain("The bridge says the suggested greeting.");
    expect(JSON.stringify(on[3])).toContain("The bridge says the real greeting.");
  }, 120_000);

  it("shows the Pico showcase's layout wherever the cursor is in it", async () => {
    const text = readFileSync(
      resolve(__dirname, "../../../../../docs/sparkle/pico-showcase.sd"),
      "utf8",
    );
    const lines = text.split("\n");
    const steps: Step[] = [0.25, 0.5, 0.75, 0.95].map((at) => ({
      select: Math.floor(lines.length * at),
    }));
    const on = await frames(text, steps);
    expect(on).toHaveLength(steps.length + 1);
    // The showcase has no scene: past its stores and functions it is one
    // layout, so every line previews from the same place, and each frame
    // draws the layout's controls.
    expect(new Set(on.launches.slice(1)).size).toBe(1);
    expect(on.launches[1]).toMatch(/main : \d+/);
    for (const frame of on.slice(1)) {
      for (const text of ["Pico", "Preview", "Subscribe", "Privacy Policy"]) {
        expect(shows(frame, text)).toBe(true);
      }
    }
  }, 120_000);
});

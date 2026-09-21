// The stopped preview displayed from the worker's game (#680) builds the same
// overlay DOM as the page's own game does, for every program and line.
//
// Each case runs the whole player twice, with the switch off and on, through
// the same sequence of compiles, selections and edits, and compares the
// serialized overlay after every step.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI } from "./playerHarness";

type Step =
  | { select: number }
  | { edit: { find: string; replace: string } }
  | { editAt: { offset: number; deleteLength: number; insert: string } }
  /** Highlight a suggestion that replaces `find` with `replace`. */
  | { suggest: { find: string; replace: string } }
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

/** Run `steps` against `text` with the switch in one position, and read the
 *  overlay after the first compile and after every step. */
async function frames(workerDisplays: boolean, text: string, steps: Step[]) {
  const h = await createPlayerHarness({
    workerDisplays,
    files: [{ uri: MAIN_URI, text }],
    startFrom: { file: MAIN_URI, line: 0 },
  });
  harnesses.push(h);
  const out: unknown[] = [];
  // A compile or selection the worker rejects is part of what is compared:
  // the route search runs the same way in both positions.
  const note = (answer: any) => {
    if (answer?.error) {
      out.push({ rejected: answer.error });
    }
  };
  note(await h.compile());
  out.push(h.snapshotDOM());
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
      await h.suggest([{ range, text: step.suggest.replace }], range.start.line);
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
    out.push(h.snapshotDOM());
  }
  // The switch really was in the position asked for.
  expect(h.controller._game == null).toBe(workerDisplays);
  return out;
}

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
  it("builds the page game's overlay over a screenplay, line by line and across edits", async () => {
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
    const on = await frames(true, text, steps);
    expect(on).toEqual(await frames(false, text, steps));
    // What was compared is the script on screen, not two empty overlays.
    expect(JSON.stringify(on[1])).toContain("Line one of dialogue in scene 0.");
    expect(JSON.stringify(on[3])).toContain("Action describing room 4.");
  }, 120_000);

  it("builds the page game's overlay while suggestions are browsed, returned to and closed", async () => {
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
    const on = await frames(true, text, steps);
    expect(on).toEqual(await frames(false, text, steps));
    expect(JSON.stringify(on[2])).toContain("A first suggestion for scene 2.");
    expect(JSON.stringify(on[3])).toContain("A second suggestion for scene 2.");
    expect(JSON.stringify(on[4])).toContain("A first suggestion for scene 2.");
    expect(JSON.stringify(on[5])).toContain(line);
  }, 120_000);

  it("builds the page game's overlay over the Pico showcase", async () => {
    const text = readFileSync(
      resolve(__dirname, "../../../../../docs/sparkle/pico-showcase.sd"),
      "utf8",
    );
    const lines = text.split("\n");
    const steps: Step[] = [0.25, 0.5, 0.75, 0.95].map((at) => ({
      select: Math.floor(lines.length * at),
    }));
    const on = await frames(true, text, steps);
    expect(on).toEqual(await frames(false, text, steps));
    expect(JSON.stringify(on.at(-1)).length).toBeGreaterThan(5000);
  }, 120_000);

  it("builds the page game's overlay across random edits and selections", async () => {
    // A deterministic LCG, as the incremental equivalence fuzz uses, so both
    // runs see the same edits.
    const plan = (seed: number) => {
      let s = seed;
      const rand = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
      const inserts = ["x", "\n", " ", "1", "{trust}", "hero:", "-> scene_2", "  A new line.\n"];
      let text = coupledScreenplay();
      const steps: Step[] = [];
      for (let n = 0; n < 12; n++) {
        if (rand() < 0.5) {
          const insert = inserts[Math.floor(rand() * inserts.length)]!;
          const deleteLength = rand() < 0.3 ? 1 + Math.floor(rand() * 6) : 0;
          const offset = Math.floor(rand() * (text.length - deleteLength));
          steps.push({ editAt: { offset, deleteLength, insert } });
          text = text.slice(0, offset) + insert + text.slice(offset + deleteLength);
        } else {
          steps.push({ select: Math.floor(rand() * text.split("\n").length) });
        }
      }
      return steps;
    };
    const steps = plan(0x680);
    const text = coupledScreenplay();
    expect(await frames(true, text, steps)).toEqual(await frames(false, text, steps));
  }, 120_000);
});

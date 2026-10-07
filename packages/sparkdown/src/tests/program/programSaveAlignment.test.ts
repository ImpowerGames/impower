// A durable save loaded into a program that differs (#1429,
// docs/engine/binary-program.md, section 8): each saved position is placed by
// the alignment of its listing with the program's, and a save falls back
// through its beats when a position cannot be placed.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript } from "./programHarness";

const silence = <T>(run: () => T): T => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const rootOf = (text: string): ProgramRoot =>
  silence(() => compileScript(text, { programChunks: true }).program.chunks!);

const engine = (root: ProgramRoot): ProgramStory => {
  const story = new ProgramStory(root);
  story.keepBeatImages = true;
  story.onError = () => {};
  return story;
};

const beats = (story: ProgramStory, max = 50): string[] => {
  const out: string[] = [];
  while (story.canContinue && out.length < max) {
    story.Continue();
    const text = story.currentText?.trim();
    if (text) out.push(text);
  }
  return out;
};

const scene = (lines: string[]) =>
  ["-> start", "scene start", ...lines.map((l) => `  ${l}`), "end", ""].join("\n");

describe("a save loaded into a program that differs", () => {
  it("loads at the same statement after a statement was inserted above it", () => {
    const before = scene(["One.", "Two.", "Three.", "Four."]);
    const story = engine(rootOf(before));
    expect(beats(story, 2)).toEqual(["One.", "Two."]);
    const save = story.toSave();
    // The position stands at "Three.", ordinal 2 before and 3 after.
    const after = scene(["Zero.", "One.", "Two.", "Three.", "Four."]);
    const loaded = engine(rootOf(after));
    loaded.loadSave(save);
    expect(beats(loaded)).toEqual(["Three.", "Four."]);
  });
});

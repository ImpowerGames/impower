// The oracle the tests of a `choose` chunk's scopes share (#1575, #1503,
// docs/engine/binary-program.md, sections 1 and 4): the depth of scopes a
// position derives from the block stack and the chunk's code, checked
// against the frame after every step of a play-through. It lives beside
// `programHarness.ts`, which the engine package's tests import too, so that
// the harness stays free of the test runner.
import "../../inkjs/engine/Container";
import { expect } from "vitest";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { Op } from "../../program/ProgramInstructions";
import { ProgramStory } from "../../program/ProgramStory";
import { blockScopes } from "../../program/StatementChunk";
import { compileScript } from "./programHarness";

/** Runs `run` with the console's warnings and errors left out. */
export const silence = <T>(run: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

/** The program engine over a script compiled with statement chunks, which
 *  must not fall back. */
export const programStory = (text: string) =>
  silence(() => {
    const { program } = compileScript(text);
    expect(program.chunks).toBeDefined();
    return new ProgramStory(program.chunks!);
  });

/** The depth of scopes the position's frame has by the block stack and the
 *  chunk's code: one for the frame, each owner's count where it enters the
 *  block the frame is inside, and the `BeginScope`s less the `EndScope`s the
 *  chunk at the position has before its offset (section 1). */
export const derivedDepth = (story: ProgramStory): number | null => {
  const state = story.state;
  const position = state.position;
  if (!position) {
    return null;
  }
  let depth = 1;
  for (const block of state.blockStack) {
    depth += blockScopes(block.sequence.arrays.chunks[block.entry]!, block.block);
  }
  const chunk = position.sequence.arrays.chunks[position.entry];
  if (chunk) {
    for (let offset = 0; offset < position.offset; offset += 2) {
      const op = BinaryProgramReader.instructionAt(chunk, offset).op;
      depth += op === Op.BeginScope ? 1 : op === Op.EndScope ? -1 : 0;
    }
  }
  return depth;
};

/** Asserts that the frame holds exactly the scopes its position derives. */
export const expectExactDepth = (story: ProgramStory, where: string) => {
  const derived = derivedDepth(story);
  if (derived !== null && story.state.callstackDepth === 1) {
    expect(story.state.frame!.temporaryScopes.length, where).toBe(derived);
  }
};

/** The beats a story shows, taking the choices `picks` names in turn (the
 *  first at every menu past them), the menus it raised, and the depth of
 *  scopes checked after every step. */
export const play = (story: ProgramStory, picks: number[] = []) => {
  const beats: string[] = [];
  const menus: string[][] = [];
  for (;;) {
    while (story.canContinue) {
      const text = (story.Continue() ?? "").trim();
      if (text) {
        beats.push(text);
      }
      expectExactDepth(story, `after ${JSON.stringify(text)}`);
    }
    const choices = story.currentChoices;
    if (choices.length === 0) {
      return { beats, menus };
    }
    menus.push(choices.map((choice) => choice.text));
    story.ChooseChoiceIndex(picks[menus.length - 1] ?? 0);
    expectExactDepth(story, "after a choice is taken");
  }
};

/** `play` over a script compiled with statement chunks. */
export const run = (text: string, picks: number[] = []) =>
  silence(() => play(programStory(text), picks));

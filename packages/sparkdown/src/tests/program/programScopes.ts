import { expect } from "vitest";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { Op } from "../../program/ProgramInstructions";
import { ProgramStory } from "../../program/ProgramStory";
import { blockScopes } from "../../program/ProgramChunk";
import { SymbolKind } from "../../program/ProgramSymbols";
import { compileScript } from "./programHarness";

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

export const programStory = (text: string) =>
  silence(() => {
    const { program } = compileScript(text);
    expect(program.chunks).toBeDefined();
    return new ProgramStory(program.chunks!);
  });

export const derivedDepth = (story: ProgramStory): number | null => {
  const state = story.state;
  const position = state.position;
  if (!position) {
    return null;
  }
  const flow = state.blockStack[0]?.sequence ?? position.sequence;
  let depth = 1 + (flow.kind === SymbolKind.Scene ? 1 : flow.kind === SymbolKind.Branch ? 2 : 0);
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

export const expectExactDepth = (story: ProgramStory, where: string) => {
  const derived = derivedDepth(story);
  if (derived !== null && story.state.callstackDepth === 1) {
    expect(story.state.frame!.temporaryScopes.length, where).toBe(derived);
  }
};

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

export const run = (text: string, picks: number[] = []) =>
  silence(() => play(programStory(text), picks));

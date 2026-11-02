import { describe, expect, it } from "vitest";
import { programSummary } from "../../compiler/utils/programSummary";
import { NO_START_SCENE_MESSAGE, playRefusalOf } from "../../compiler/utils/startScene";
import { programCompiler } from "../program/programHarness";

const MAIN = "file://proj/main.sd";
const OTHER = "file://proj/scripts/other.sd";
const NEWLINE = String.fromCharCode(10);
const lines = (...text: string[]) => text.join(NEWLINE) + NEWLINE;

const compiled = (texts: Record<string, string>) => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return programCompiler(texts).compile(MAIN).program;
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

describe("PLAY for a story with no start scene", () => {
  it("is refused with the missing-start message, on the program and on its summary", () => {
    const program = compiled({
      [MAIN]: lines("store gold = 1", "scene other", "  Other.", "end"),
    });
    expect(playRefusalOf(program)).toBe(NO_START_SCENE_MESSAGE);
    expect(programSummary(program, true).playRefusal).toBe(NO_START_SCENE_MESSAGE);
    expect(playRefusalOf(programSummary(program, true))).toBe(NO_START_SCENE_MESSAGE);
  });

  it("runs once any script declares a start scene", () => {
    const program = compiled({
      [MAIN]: lines("store gold = 1"),
      [OTHER]: lines("scene start", "  Begin.", "end"),
    });
    expect(playRefusalOf(program)).toBeUndefined();
    expect(programSummary(program, true).playRefusal).toBeUndefined();
  });

  it("is not refused for a start scene's other errors", () => {
    const program = compiled({
      [MAIN]: lines("scene start(x)", "  Begin.", "end"),
    });
    expect(playRefusalOf(program)).toBeUndefined();
  });
});

// A program of statement chunks builds no path-location table (#700). Its root
// locates every address from the chunks' own line tables
// (docs/engine/binary-program.md, section 8), so a compile with
// `programChunks` on walks no runtime tree for locations and sorts none: the
// two phases that build the current engine's table, `populateLocations` and
// `sortPathLocations`, are absent from its profile, as is the table. The scene
// assets it carries are read from its chunks, and each beat is known by the
// address of its `LineStart`.
import "../../inkjs/engine/Container";
import { afterEach, describe, expect, it, vi } from "vitest";
import { programLocator } from "../../compiler/utils/programLocator";
import { MAIN_URI, programCompiler } from "./programHarness";

const TEXT = [
  "store trust = 0",
  "",
  "scene MAIN",
  "  [[raffles_concerned]] Raffles waits by the door.",
  "  & trust = trust + 1",
  "  if trust > 0 then",
  "    ((door_creak)) Bunny arrives.",
  "  end",
  "  The door closes.",
  "  -> ELSEWHERE",
  "end",
  "",
  "scene ELSEWHERE",
  "  [[street]] A street at night.",
  "end",
  "",
].join("\n");

const quiet = <T>(run: () => T): T => {
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

/** A compile, an edit inside one beat and a compile again, with the phases
 *  each compile measured. */
function editInsideOneBeat(programChunks: boolean) {
  const c = programCompiler({ [MAIN_URI]: TEXT }, {
    programChunks,
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
  } as never);
  c.compiler.profilerId = "700";
  const measure = vi.spyOn(performance, "measure");
  const first = quiet(() => c.compile()).program;
  const before = measure.mock.calls.length;
  const find = "Raffles waits by the door.";
  const offset = TEXT.indexOf(find);
  const line = TEXT.slice(0, offset).split("\n").length - 1;
  const character = offset - TEXT.lastIndexOf("\n", offset) - 1 + find.length - 1;
  quiet(() =>
    c.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [
        {
          range: {
            start: { line, character },
            end: { line, character },
          },
          text: " quietly",
        },
      ],
    } as never),
  );
  const edited = quiet(() => c.compile()).program;
  const phases = measure.mock.calls
    .slice(before)
    .map(([name]) => String(name));
  measure.mockRestore();
  return { first, edited, phases };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a compile with statement chunks", () => {
  it("runs neither populateLocations nor sortPathLocations for an edit inside one beat, and builds no path-location table", () => {
    const { first, edited, phases } = editInsideOneBeat(true);
    expect(first.chunks).toBeDefined();
    expect(edited.chunks).toBeDefined();
    expect(edited.fallback).toBeUndefined();
    // The compile was measured, and built its chunks.
    expect(phases.some((name) => name.includes("program/chunks"))).toBe(true);
    expect(phases.filter((name) => /populateLocations|sortPathLocations/.test(name))).toEqual([]);
    expect(first.pathLocations).toBeUndefined();
    expect(edited.pathLocations).toBeUndefined();
    // The edit is in the program: its beat is at its line.
    const locator = programLocator(edited);
    const address = locator.addressAt(MAIN_URI, 3)!;
    expect(locator.locationOf(address)).toMatchObject({ uri: MAIN_URI, startLine: 3 });
  });

  it("is told apart from a compile without them, which runs both and builds the table", () => {
    const { edited, phases } = editInsideOneBeat(false);
    expect(phases.some((name) => name.includes("populateLocations"))).toBe(true);
    expect(phases.some((name) => name.includes("sortPathLocations"))).toBe(true);
    expect(edited.pathLocations?.paths.length).toBeGreaterThan(0);
  });

  it("reads its scene assets from its chunks, each beat at its LineStart's address", () => {
    const c = programCompiler({ [MAIN_URI]: TEXT }, {
      programChunks: true,
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
    } as never);
    const program = quiet(() => c.compile()).program;
    const assets = program.sceneAssets!;
    const locator = programLocator(program);
    expect(assets["MAIN"]).toMatchObject({
      kind: "scene",
      image: ["raffles_concerned"],
      audio: ["door_creak"],
      successors: ["ELSEWHERE"],
    });
    expect(assets["ELSEWHERE"]).toMatchObject({ image: ["street"] });
    const beats = assets["MAIN"]!.beats;
    expect(beats.map((beat) => locator.locationOf(beat.address)?.startLine)).toEqual([3, 6]);
    expect(beats[0]!.address).toBe(locator.addressAt(MAIN_URI, 3));
    expect(beats[1]!.address).toBe(locator.addressAt(MAIN_URI, 6));
  });

  // Round 1 of the review of #1618 (report 6026971997): an interpolation
  // splits a beat's text into several literals, each of which named the
  // beat's address in a record of its own.
  it("names one record for a beat whose text an interpolation splits", () => {
    const text = [
      "store score = 0",
      "",
      "-> MAIN",
      "",
      "scene MAIN",
      "  [[room]] Hello {score} [[portrait]] and [[room]] again.",
      "  [[street]] Later.",
      "end",
      "",
    ].join("\n");
    const c = programCompiler({ [MAIN_URI]: text }, {
      programChunks: true,
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
    } as never);
    const program = quiet(() => c.compile()).program;
    expect(program.chunks).toBeDefined();
    const locator = programLocator(program);
    const beats = program.sceneAssets!["MAIN"]!.beats;
    expect(beats.map((beat) => beat.image)).toEqual([["room", "portrait"], ["street"]]);
    expect(beats.map((beat) => beat.address)).toEqual([
      locator.addressAt(MAIN_URI, 5),
      locator.addressAt(MAIN_URI, 6),
    ]);
  });
});

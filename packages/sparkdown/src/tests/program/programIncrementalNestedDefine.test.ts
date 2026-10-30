import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import type { ProgramRoot } from "../../program/ProgramRoot";
import {
  coldSurface,
  CONFIG,
  divergence,
  quiet,
  surface,
  update,
} from "./incrementalOracleHarness";
import { MAIN_URI, programCompiler, storyBeats } from "./programHarness";

const editedElsewhere = (rest: string[]) =>
  quiet(() => {
    const text = ["scene start", "  hero: Not yet in scene 2.", "end", ...rest, ""].join("\n");
    const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
    const before = c.compile().program;
    const from = text.indexOf("ene 2");
    const edited = update(c.compiler, text, 2, from, from + "ene 2".length, "// c");
    const incremental = surface(c.compile().program);
    const cold = coldSurface(edited);
    return {
      built: [!!before.chunks, !!incremental.chunks, !!cold.chunks],
      divergence: divergence(incremental, cold),
    };
  });

const inScene = (lines: string[]) => ["scene scene_9", ...lines, "hero: After the block.", "end"];

describe("a declaration nested in a block or a function, compiled incrementally", () => {
  it.each([
    ["a define indented under an if", inScene(["if trust > 2 then", "  define header with", "    & local h = function(n) return n + 1 end", "  end", "end"])],
    ["a define at column 0 under an if", inScene(["if trust > 2 then", "define header with", "  & local h = function(n) return n + 1 end", "end"])],
    ["a define between other statements of an if", inScene(["if trust > 2 then", "  hero: Before.", "define header with", "  & local h = function(n) return n + 1 end", "  hero: After.", "else", "  hero: Otherwise.", "end"])],
    ["a define whose method captures a block local", inScene(["if trust > 2 then", "  local k = 2", "  define header with", "    function get() return k end", "  end", "end"])],
    ["a define in a do block", inScene(["do", "  define header with", "    & local h = function(n) return n + 1 end", "  end", "end"])],
    ["a define in a function's body", inScene(["& local f = function()", "  define header with", "    & local h = function(n) return n + 1 end", "  end", "end"])],
    ["a define whose method captures a function's local", inScene(["& local f = function()", "  local k = 2", "  define header with", "    function get() return k end", "  end", "end"])],
    ["a define whose method captures a function's parameter", inScene(["& local f = function(k)", "  define header with", "    function get() return k end", "  end", "end"])],
    ["a define in a named function whose method captures its parameter", ["function outer(k)", "  define header with", "    function get() return k end", "  end", "end", ...inScene([])]],
    ["a const holding a function", inScene(["if trust > 2 then", "  const LIMIT = function(n) return n end", "end"])],
    ["a store holding a function", inScene(["if trust > 2 then", "  store saved = function(n) return n end", "end"])],
  ])("builds %s and matches the cold compile after an edit in another scene", (_, rest) => {
    const result = editedElsewhere(rest);
    expect(result.built, "first, incremental and cold compiles built programs").toEqual([true, true, true]);
    expect(result.divergence).toBeUndefined();
  });

  it("runs a define's method with the value its function captured, before and after an edit", () => {
    const text = [
      "function outer(k)",
      "  local doubled = k * 2",
      "  define holder with",
      "    function get() return doubled end",
      "  end",
      "  return holder",
      "end",
      "scene start",
      "  Opening line.",
      "  & local h = outer(4)",
      "  Holder says {h.get()}.",
      "end",
      "",
    ].join("\n");
    const shown = (program: { chunks?: ProgramRoot }) => {
      expect(!!program.chunks, "the compile built a program").toBe(true);
      const { beats, errors } = storyBeats(new ProgramStory(program.chunks!));
      return { text: beats.map((beat) => beat.text.trim()), errors };
    };
    quiet(() => {
      const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
      expect(shown(c.compile().program)).toEqual({ text: ["Opening line.", "Holder says 8."], errors: [] });
      const from = text.indexOf("Opening line.");
      update(c.compiler, text, 2, from, from + "Opening line.".length, "Opening line, edited.");
      expect(shown(c.compile().program)).toEqual({ text: ["Opening line, edited.", "Holder says 8."], errors: [] });
    });
  });
});

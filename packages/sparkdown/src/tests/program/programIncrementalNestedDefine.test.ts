import { describe, expect, it } from "vitest";
import {
  coldSurface,
  CONFIG,
  divergence,
  quiet,
  surface,
  update,
} from "./incrementalOracleHarness";
import { MAIN_URI, programCompiler } from "./programHarness";

const editedElsewhere = (scene: string[]) =>
  quiet(() => {
    const text = ["scene start", "  hero: Not yet in scene 2.", "end", "scene scene_9", ...scene, "hero: After the block.", "end", ""].join("\n");
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

describe("a declaration nested in a scene's block, compiled incrementally", () => {
  it.each([
    ["a define indented under an if", ["if trust > 2 then", "  define header with", "    & local h = function(n) return n + 1 end", "  end", "end"]],
    ["a define at column 0 under an if", ["if trust > 2 then", "define header with", "  & local h = function(n) return n + 1 end", "end"]],
    ["a define between other statements of an if", ["if trust > 2 then", "  hero: Before.", "define header with", "  & local h = function(n) return n + 1 end", "  hero: After.", "else", "  hero: Otherwise.", "end"]],
    ["a define whose method captures a local", ["if trust > 2 then", "  & local k = 2", "  define header with", "    function bump(self, n)", "      return n + k", "    end", "  end", "end"]],
    ["a define in a do block", ["do", "  define header with", "    & local h = function(n) return n + 1 end", "  end", "end"]],
    ["a define in a function's body", ["& local f = function()", "  define header with", "    & local h = function(n) return n + 1 end", "  end", "end"]],
    ["a const holding a function", ["if trust > 2 then", "  const LIMIT = function(n) return n end", "end"]],
    ["a store holding a function", ["if trust > 2 then", "  store saved = function(n) return n end", "end"]],
  ])("builds %s and matches the cold compile after an edit in another scene", (_, scene) => {
    const result = editedElsewhere(scene);
    expect(result.built, "first, incremental and cold compiles built programs").toEqual([true, true, true]);
    expect(result.divergence).toBeUndefined();
  });
});

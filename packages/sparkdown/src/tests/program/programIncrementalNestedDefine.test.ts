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

const editedElsewhere = (text: string) =>
  quiet(() => {
    const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
    const before = c.compile().program;
    const from = text.indexOf("ene 2");
    const edited = update(c.compiler, text, 2, from, from + "ene 2".length, "// c");
    return {
      built: before.chunks !== null,
      divergence: divergence(surface(c.compile().program), coldSurface(edited)),
    };
  });

describe("a define nested in a scene's block, compiled incrementally", () => {
  it("matches the cold compile after an edit in another scene", () => {
    const result = editedElsewhere(
      [
        "scene start",
        "  hero: Not yet in scene 2.",
        "end",
        "scene scene_9",
        "if trust > 2 then",
        "  define header with",
        "    & local h = function(n) return n + 1 end",
        "  end",
        "end",
        "",
      ].join("\n"),
    );
    expect(result.built).toBe(true);
    expect(result.divergence).toBeUndefined();
  });

  it("matches the cold compile when the define is not indented under its block", () => {
    const result = editedElsewhere(
      [
        "scene start",
        "  hero: Not yet in scene 2.",
        "end",
        "scene scene_9",
        "if trust > 2 then",
        "define header with",
        "  & local h = function(n) return n + 1 end",
        "",
      ].join("\n"),
    );
    expect(result.built).toBe(true);
    expect(result.divergence).toBeUndefined();
  });

  it("builds and matches the cold compile when the define sits between other statements of the block", () => {
    const result = editedElsewhere(
      [
        "scene start",
        "  hero: Not yet in scene 2.",
        "end",
        "scene scene_9",
        "if trust > 2 then",
        "  hero: Before.",
        "define header with",
        "  & local h = function(n) return n + 1 end",
        "  hero: After.",
        "else",
        "  hero: Otherwise.",
        "end",
        "",
      ].join("\n"),
    );
    expect(result.built).toBe(true);
    expect(result.divergence).toBeUndefined();
  });
});

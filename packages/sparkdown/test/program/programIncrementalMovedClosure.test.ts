import { describe, expect, it } from "vitest";
import { MAIN_URI, programCompiler } from "./programHarness";
import { coldSurface, CONFIG, divergence, quiet, surface, update } from "./incrementalOracleHarness";

describe("a closure statement an edit moves between a scene and a block body", () => {
  const moved = (text: string, find: string, deleted: number, insert: string) =>
    quiet(() => {
      const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
      expect(c.compile().program.chunks).toBeDefined();
      const offset = text.indexOf(find);
      expect(offset, find).toBeGreaterThanOrEqual(0);
      const after = update(c.compiler, text, 2, offset, offset + deleted, insert);
      const program = c.compile().program;
      expect(program.chunks).toBeDefined();
      return divergence(surface(program), coldSurface(after)) ?? "none";
    });

  it("gives the statement the line table of a cold compile when it moves into an if body", () => {
    const text = "scene S\n  Before.\n  if true then\n    Inside.\n  end\n  & local f = function(n) return n + 1 end\nend\n";
    expect(moved(text, "  end\n  & local", "  end\n".length, "")).toBe("none");
  }, 60_000);

  it("gives the statement the line table of a cold compile when it moves out of an if body", () => {
    const text = "scene S\n  Before.\n  if true then\n    Inside.\n    & local f = function(n) return n + 1 end\n  end\nend\n";
    expect(moved(text, "    Inside.", 0, "    end\n")).toBe("none");
  }, 60_000);
});

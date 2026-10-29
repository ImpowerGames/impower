import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const MISPLACED = (keyword: string) =>
  `'${keyword}' is a top-level declaration and cannot be written inside a function`;

const KINDS = [
  {
    keyword: "animation",
    lines: ["animation wobble with", "  duration = 7", "end"],
    sibling: "animation still with\n  duration = 1\nend",
    path: "animation.wobble",
    value: "animation.wobble.duration",
  },
  {
    keyword: "theme",
    lines: ["theme dusk with", "  g = 7", "end"],
    sibling: "theme dawn with\n  g = 1\nend",
    path: "theme.dusk",
    value: "theme.dusk.g",
  },
] as const;

const indent = (lines: readonly string[], n: number) =>
  lines.map((line) => " ".repeat(n) + line).join("\n");

const SHAPES: Record<string, { source: (decl: readonly string[]) => string; call: string }> = {
  "a function's body": {
    source: (decl) => `function f()\n${indent(decl, 2)}\n  return 0\nend`,
    call: "f()",
  },
  "a nested local function's body": {
    source: (decl) => `function f()\n  local function h()\n${indent(decl, 4)}\n    return 0\n  end\n  return h()\nend`,
    call: "f()",
  },
  "a function value's body": {
    source: (decl) => `function f()\n  local h = function()\n${indent(decl, 4)}\n    return 0\n  end\n  return h()\nend`,
    call: "f()",
  },
  "an if block in a function": {
    source: (decl) => `function f()\n  if true then\n${indent(decl, 4)}\n  end\n  return 0\nend`,
    call: "f()",
  },
  "a define's `function` method": {
    source: (decl) => `define thing with\n  function go()\n${indent(decl, 4)}\n    return 0\n  end\nend`,
    call: "thing:go()",
  },
  "a define's method": {
    source: (decl) => `define thing with\n  go()\n${indent(decl, 4)}\n    return 0\n  end\nend`,
    call: "thing:go()",
  },
};

describe("an animation or theme written inside a function (I-1405)", () => {
  for (const kind of KINDS) {
    for (const [where, shape] of Object.entries(SHAPES)) {
      test(`\`${kind.keyword}\` in ${where} is not registered when it runs`, () => {
        const ctx = makeRuntimeStoryFromSource(
          `${kind.sibling}\n${shape.source(kind.lines)}\nGo {${shape.call}}. Registered {${kind.path} ~= nil}.\n`,
        );
        const text = ctx.story.Continue();
        expect([...ctx.errorMessages]).toEqual([MISPLACED(kind.keyword)]);
        expect(text).toBe("Go 0. Registered false.\n");
      });
    }

    test(`\`${kind.keyword}\` at the top level is registered when the story runs`, () => {
      const ctx = makeRuntimeStoryFromSource(
        `${kind.lines.join("\n")}\nfunction f()\n  return 0\nend\nGo {f()}. Registered {${kind.value}}.\n`,
      );
      const text = ctx.story.Continue();
      expect([...ctx.errorMessages]).toEqual([]);
      expect(text).toBe("Go 0. Registered 7.\n");
    });
  }
});

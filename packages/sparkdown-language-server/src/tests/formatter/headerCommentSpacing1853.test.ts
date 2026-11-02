import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("Format Document spaces a header's block comments", () => {
  test.each([
    ["style   --[[c]]  banner with\n  color = red\nend\n", "style --[[c]] banner with\n  color = red\nend\n"],
    ["animation   --[[c]]  fade with\nend\n", "animation --[[c]] fade with\nend\n"],
    ["theme   --[[c]]  t with\nend\n", "theme --[[c]] t with\nend\n"],
    ["morph  --[[c]]   --[=[d]=]  m with\nend\n", "morph --[[c]] --[=[d]=] m with\nend\n"],
    ["layout   --[[c]]  hud with\nend\n", "layout --[[c]] hud with\nend\n"],
    ["screen   --[[c]]  scr with\nend\n", "screen --[[c]] scr with\nend\n"],
    ["component   --[[c]]  card with\nend\n", "component --[[c]] card with\nend\n"],
    ["define   --[[c]]  Person with\n  name = \"a\"\nend\n", "define --[[c]] Person with\n  name = \"a\"\nend\n"],
    ["export type function   --[[c]]  Keys<T>(t) return t end\n", "export type function --[[c]] Keys<T>(t) return t end\n"],
  ])("%j formats to one space on each side of the comment", (source, expected) => {
    expect(formatSource(source)).toBe(expected);
  });
});

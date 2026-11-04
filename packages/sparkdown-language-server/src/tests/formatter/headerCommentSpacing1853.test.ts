import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("Format Document spaces a header's block comments", () => {
  test.each([
    ["style   --[[c]]  banner {\n  color = red\n}\n", "style --[[c]] banner {\n  color = red\n}\n"],
    ["animation   --[[c]]  fade {\n}\n", "animation --[[c]] fade {\n}\n"],
    ["theme   --[[c]]  t {\n}\n", "theme --[[c]] t {\n}\n"],
    ["morph  --[[c]]   --[=[d]=]  m {\n}\n", "morph --[[c]] --[=[d]=] m {\n}\n"],
    ["layout   --[[c]]  hud {\n}\n", "layout --[[c]] hud {\n}\n"],
    ["screen   --[[c]]  scr {\n}\n", "screen --[[c]] scr {\n}\n"],
    ["component   --[[c]]  card {\n}\n", "component --[[c]] card {\n}\n"],
    ["define   --[[c]]  Person with\n  name = \"a\"\nend\n", "define --[[c]] Person with\n  name = \"a\"\nend\n"],
    ["export type function   --[[c]]  Keys<T>(t) return t end\n", "export type function --[[c]] Keys<T>(t) return t end\n"],
  ])("%j formats to one space on each side of the comment", (source, expected) => {
    expect(formatSource(source)).toBe(expected);
  });
});

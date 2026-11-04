import { describe, expect, test } from "vitest";
import { MAIN_URI, programCompiler } from "@impower/sparkdown/src/tests/program/programHarness";
import { formatSource } from "./formatSource";

const script = (value: string) =>
  [
    "function f(x)",
    "  return x",
    "end",
    "",
    "layout first {",
    `  row { button @click=${value} .wide "Over"; text "after" }`,
    "}",
    "",
    "scene start",
    "  Hi.",
    "end",
    "",
  ].join("\n");

const compiled = (source: string) => {
  const { program } = programCompiler({ [MAIN_URI]: source }).compile();
  const errors = Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d: any) => d.severity === 1);
  const button = (program as any).sparkle.layouts.first.children[0].children[0];
  return { errors, handler: button.events[0]?.handler?.binding?.source, classes: button.classes, content: button.content };
};

describe("Format Document leaves an event value's operators as written", () => {
  test.each(["f(1)+2", "f(1)*2", "x+1", "x..y", "f(1)+{ a = 1 }"])("`@click=%s` keeps its handler, class and content", (value) => {
    const source = script(value);
    const formatted = formatSource(source);
    expect(formatted).toBe(source);
    const after = compiled(formatted);
    expect(after.errors).toEqual([]);
    expect(after.handler).toBe(value);
    expect(after.classes).toEqual(["wide"]);
    expect(after.content).toEqual([{ kind: "literal", text: "Over" }]);
  });

  test("an operator inside the call's parentheses is still spaced", () => {
    expect(formatSource(script("f(1+2)"))).toBe(script("f(1 + 2)"));
  });
});

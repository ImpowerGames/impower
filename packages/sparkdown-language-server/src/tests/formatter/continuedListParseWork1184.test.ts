import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { afterEach, describe, expect, test, vi } from "vitest";
import { formatSource } from "./formatSource";

function continuedReassignments(count: number, indent: string): string {
  const lines = ["function f()", "  local a, b = 0, 0"];
  for (let i = 0; i < count; i++) lines.push(`  a, b = ${i},`, `${indent}${i + 1}`);
  lines.push("  return a + b", "end", "");
  return lines.join("\n");
}

function reparsedCharacters(source: string): number {
  let characters = 0;
  const parse = TextmateGrammarParser.prototype.parse;
  const spy = vi
    .spyOn(TextmateGrammarParser.prototype, "parse")
    .mockImplementation(function (this: TextmateGrammarParser, ...args: Parameters<typeof parse>) {
      const input = args[0];
      if (typeof input === "string" && input.startsWith("function __list()")) characters += input.length;
      return parse.apply(this, args);
    });
  try {
    formatSource(source);
  } finally {
    spy.mockRestore();
  }
  return characters;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reparsing continued reassignment lists while formatting", () => {
  test("formats every continued value one level past its reassignment", () => {
    const source = continuedReassignments(16, "");
    expect(formatSource(source)).toBe(continuedReassignments(16, "    "));
  });

  test("reparses a number of characters linear in the reassignments", () => {
    const few = reparsedCharacters(continuedReassignments(8, ""));
    const many = reparsedCharacters(continuedReassignments(64, ""));
    expect(few).toBeGreaterThan(0);
    expect(many / few).toBeLessThan(12);
  });
});

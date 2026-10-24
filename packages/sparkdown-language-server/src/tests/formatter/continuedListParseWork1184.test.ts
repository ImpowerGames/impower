// The formatter reads where a list continued after a comma that ends its line
// ends by parsing the block it stands in again, indented (I-1184). That work
// grows with the block, not with the block times its continued statements:
// formatting a function of R short continued reassignments reparses about as
// many characters per reassignment whatever R is.

import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { afterEach, describe, expect, test, vi } from "vitest";
import { formatSource } from "./formatSource";

// The function of `count` reassignments, each continued onto a second line.
function continuedReassignments(count: number, indent: string): string {
  const lines = ["function f()", "  local a, b = 0, 0"];
  for (let i = 0; i < count; i++) lines.push(`  a, b = ${i},`, `${indent}${i + 1}`);
  lines.push("  return a + b", "end", "");
  return lines.join("\n");
}

// The characters the formatter's list parses read while formatting `source`.
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
    // 8 times the reassignments: linear work is about 8 times as much,
    // reparsing every reassignment's rest of the block about 60 times.
    expect(many / few).toBeLessThan(12);
  });
});

import { describe, expect, test, vi } from "vitest";
import { SparkdownDocument } from "../../compiler/classes/SparkdownDocument";
import { getParser } from "../compiler/grammarSnapshot";

function lineChunkInput(text: string) {
  return {
    length: text.length,
    lineChunks: true,
    chunk(from: number) {
      if (text[from] === "\n") return "\n";
      const lineEnd = text.indexOf("\n", from);
      return text.slice(from, lineEnd < 0 ? text.length : lineEnd);
    },
    read(from: number, to: number) {
      return text.slice(from, to);
    },
  };
}

function parse(input: string | object, from = 0) {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const nodes: string[] = [];
    getParser()
      .parse(input as never)
      .iterate({
        enter(node) {
          if (node.to > from) nodes.push(`${node.name} ${node.from}..${node.to}`);
        },
      });
    const loops = warn.mock.calls.filter((call) => /empty matches/.test(String(call[0]))).length;
    return { tree: nodes.join("\n"), loops };
  } finally {
    warn.mockRestore();
  }
}

const fn = (first: string, next: string) => `function f(c)\n  ${first}\n${next}\n  return x\nend\n`;
const scene = (first: string, next: string) => `scene s\n  ${first}\n${next}\nend\n`;
const root = (first: string, next: string) => `local c = true\n${first}\n${next}\n`;
const ifBlock = (first: string, next: string) => `if c then\n  ${first}\n${next}\nend\n`;

const LINES: [string, string][] = [
  ["x = if c then 1", "print(x)"],
  ["x = if c then", "print(x)"],
  ["x = if c", "print(x)"],
  ["x = if c then", "Hello."],
  ["x = if c then 1", "y = 2"],
  ["x += if c then 1", "print(x)"],
  ["x = if c then 1 else", "y = 6"],
  ["local x = if c then 1", "print(x)"],
  ["local x = if c then 1 else", "y = 6"],
  ["a, b = 1, if c then 2", "print(a)"],
  ["x = if c then 1", "else = 2"],
];

const CONTEXTS = { fn, scene, root, ifBlock };

describe("a column-0 line after an unfinished if expression parses the same from every input", () => {
  for (const [contextName, wrap] of Object.entries(CONTEXTS)) {
    for (const [first, next] of LINES) {
      const source = wrap(first, next);
      test(`${contextName}: ${JSON.stringify(first)} then ${JSON.stringify(next)}`, () => {
        const whole = parse(source);
        expect(whole.loops).toBe(0);
        const lines = parse(lineChunkInput(source));
        expect(lines.loops).toBe(0);
        expect(lines.tree).toBe(whole.tree);
      });

      test(`${contextName}: ${JSON.stringify(first)} then ${JSON.stringify(next)} at a slice end`, () => {
        const size = SparkdownDocument.CHUNK_TARGET_SIZE;
        const breakAt = source.indexOf("\n", source.indexOf(first));
        const fillerLine = "-- filler\n";
        const fillerLength = size - breakAt;
        const filler = fillerLine.repeat(Math.floor(fillerLength / fillerLine.length)) + "\n".repeat(fillerLength % fillerLine.length);
        const padded = filler + source;
        expect(padded[size]).toBe("\n");
        const whole = parse(padded, filler.length);
        const doc = new SparkdownDocument("file:///t.sd", "sparkdown", 1, padded);
        const sliced = parse(doc, filler.length);
        expect(sliced.loops).toBe(0);
        expect(sliced.tree).toBe(whole.tree);
      });
    }
  }
});

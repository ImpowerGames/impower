// A style value that starts with `--` (#829) is the value, as the compiler
// reads it, not a comment: a comment in a value begins only after
// whitespace. Both engines must color it so; a `--` after whitespace stays a
// comment. The fixture is `__snapshots__/grammar/struct/` in the corpus,
// so scopeEquality also holds the two engines to the same scopes.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parseSource } from "./grammarSnapshot";
import { treeScopeStackAt, vscodeScopeStacksPerChar } from "./scopeEquality";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "__snapshots__/grammar/struct/style-value-starts-with-comment-mark-829.sd",
);

const source = readFileSync(FIXTURE, "utf8").replace(/\r\n?/g, "\n");

/** The offset of the `occurrence`th (0-based) `text` on the line that starts with `linePrefix`. */
function offsetOf(linePrefix: string, text: string, occurrence = 0): number {
  const lineStart = source.indexOf(`\n${linePrefix}`) + 1;
  expect(lineStart, `line ${JSON.stringify(linePrefix)}`).toBeGreaterThan(0);
  const lineEnd = source.indexOf("\n", lineStart);
  let at = lineStart - 1;
  for (let i = 0; i <= occurrence; i += 1) {
    at = source.indexOf(text, at + 1);
  }
  expect(at, `${JSON.stringify(text)} on ${JSON.stringify(linePrefix)}`).toBeGreaterThanOrEqual(lineStart);
  expect(at).toBeLessThan(lineEnd);
  return at;
}

async function scopesOf(start: number, length: number) {
  const vscode = await vscodeScopeStacksPerChar(source);
  const tree = parseSource(source);
  const result: { char: string; vscode: string[]; tree: string[] }[] = [];
  for (let offset = start; offset < start + length; offset += 1) {
    result.push({
      char: source[offset]!,
      vscode: vscode[offset]!,
      tree: treeScopeStackAt(tree, offset),
    });
  }
  return result;
}

const isComment = (stack: string[]) => stack.some((scope) => scope.startsWith("comment."));

describe("a style value that starts with `--` (#829)", () => {
  const values: [linePrefix: string, occurrence: number][] = [
    ["  gap = --gap", 0],
    ["  margin = --gap -- note", 0],
    ["  g { gap = --gap }", 0],
  ];
  for (const [linePrefix, occurrence] of values) {
    test(`is the value, not a comment: ${linePrefix.trim()}`, async () => {
      for (const char of await scopesOf(offsetOf(linePrefix, "--gap", occurrence), "--gap".length)) {
        expect(isComment(char.vscode), `vscode ${JSON.stringify(char)}`).toBe(false);
        expect(isComment(char.tree), `tree ${JSON.stringify(char)}`).toBe(false);
      }
    });
  }

  const comments: string[] = ["  margin = --gap -- note", "  padding = 1 -- note"];
  for (const linePrefix of comments) {
    test(`leaves a \`--\` after whitespace a comment: ${linePrefix.trim()}`, async () => {
      for (const char of await scopesOf(offsetOf(linePrefix, "-- note"), "-- note".length)) {
        expect(isComment(char.vscode), `vscode ${JSON.stringify(char)}`).toBe(true);
        expect(isComment(char.tree), `tree ${JSON.stringify(char)}`).toBe(true);
      }
    });
  }
});

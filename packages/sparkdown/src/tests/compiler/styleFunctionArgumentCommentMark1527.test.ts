// A style function argument that starts with `--` (#1527, `var(--gap)`) is
// the argument, as the compiler reads it, not a comment, and the function's
// `)` still closes it. A `--` after whitespace stays a comment, inside the
// parentheses and after them. The fixture is `__snapshots__/grammar/struct/`
// in the corpus, so scopeEquality also holds the two engines to the same
// scopes.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parseSource } from "./grammarSnapshot";
import { treeScopeStackAt, vscodeScopeStacksPerChar } from "./scopeEquality";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "__snapshots__/grammar/struct/style-function-argument-comment-mark-1527.sd",
);

const source = readFileSync(FIXTURE, "utf8").replace(/\r\n?/g, "\n");

/** The offset of the first `text` on the line that starts with `linePrefix`. */
function offsetOf(linePrefix: string, text: string): number {
  const lineStart = source.indexOf(`\n${linePrefix}`) + 1;
  expect(lineStart, `line ${JSON.stringify(linePrefix)}`).toBeGreaterThan(0);
  const lineEnd = source.indexOf("\n", lineStart);
  const at = source.indexOf(text, lineStart);
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
const isParenClose = (stack: string[]) =>
  stack.some((scope) => scope.startsWith("punctuation.definition.template-expression.end"));

describe("a style function argument that starts with `--` (#1527)", () => {
  for (const linePrefix of ["  gap = var(--gap)", "  margin = var(--gap) -- note"]) {
    test(`is the argument, not a comment: ${linePrefix.trim()}`, async () => {
      for (const char of await scopesOf(offsetOf(linePrefix, "--gap"), "--gap".length)) {
        expect(isComment(char.vscode), `vscode ${JSON.stringify(char)}`).toBe(false);
        expect(isComment(char.tree), `tree ${JSON.stringify(char)}`).toBe(false);
      }
      const [close] = await scopesOf(offsetOf(linePrefix, ")"), 1);
      expect(isParenClose(close!.vscode), `vscode ${JSON.stringify(close)}`).toBe(true);
      expect(isParenClose(close!.tree), `tree ${JSON.stringify(close)}`).toBe(true);
    });
  }

  for (const linePrefix of ["  margin = var(--gap) -- note", "  padding = calc(1px -- note"]) {
    test(`leaves a \`--\` after whitespace a comment: ${linePrefix.trim()}`, async () => {
      for (const char of await scopesOf(offsetOf(linePrefix, "-- note"), "-- note".length)) {
        expect(isComment(char.vscode), `vscode ${JSON.stringify(char)}`).toBe(true);
        expect(isComment(char.tree), `tree ${JSON.stringify(char)}`).toBe(true);
      }
    });
  }
});

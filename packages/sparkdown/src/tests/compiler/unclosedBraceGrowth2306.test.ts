import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import onig from "vscode-oniguruma";
import { describe, expect, test } from "vitest";
import { parseSource } from "./grammarSnapshot";
import { tokenize } from "./vscodeGrammarSnapshot";

const __dirname = dirname(fileURLToPath(import.meta.url));
const grammar = JSON.parse(readFileSync(join(__dirname, "../../../language/sparkdown.language-grammar.json"), "utf8"));

const BRACES = 2000;

const PLACES: [string, (unit: string) => string][] = [
  ["a display line", (unit) => `scene start\n  A${unit.repeat(BRACES)}\nend\n`],
  ["a choice start", (unit) => `scene start\n  choose\n    + ${unit.repeat(BRACES)}\n      done\n  end\nend\n`],
];

const fastest = (read: () => unknown) => {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    read();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
};

const RULE_SEARCHES: [string, string][] = [
  ["LuauFunctionDeclarationName", grammar.repository.LuauFunctionDeclarationName.match],
  ["LuauAccessPath's end", grammar.repository.LuauAccessPath.end],
];

describe("a line of unclosed braces is read in time linear in its length (#2306)", () => {
  test.each(PLACES)("%s of 2,000 unclosed braces, in the tree parser, takes less than four times the same line with each brace closed", (_where, source) => {
    parseSource("scene start\n  A {b} {b\nend\n");
    const closed = fastest(() => parseSource(source(" {b}")));
    const unclosed = fastest(() => parseSource(source(" {b")));
    expect(unclosed, `closed took ${closed.toFixed(1)}ms, unclosed took ${unclosed.toFixed(1)}ms`).toBeLessThan(4 * closed + 40);
  });

  test.each(RULE_SEARCHES)(
    "%s, searched as vscode-textmate searches it from every name on a line of 2,000 unclosed braces, never reads back to the line start",
    async (_rule, source) => {
      await tokenize("scene start\n  A {b} c\nend\n");
      const scanner = new onig.OnigScanner([source]);
      scanner.findNextMatchSync(new onig.OnigString("  A {b {b\n"), 0);
      const line = `  A${" {b".repeat(BRACES)}\n`;
      const ms = fastest(() => {
        const text = new onig.OnigString(line);
        for (let at = line.indexOf("b"); at < line.length; at += 3) {
          scanner.findNextMatchSync(text, at);
        }
      });
      expect(ms, `took ${ms.toFixed(1)}ms`).toBeLessThan(40);
    },
  );
});

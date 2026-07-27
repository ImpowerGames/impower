// Guards against catastrophic regex backtracking in the sparkdown grammar
// (issue #280). The ParentheticalLine pattern contained a star over
// alternatives where one alternative was a NULLABLE whitespace star —
// `(?:[=].*?[=]|[<].*?[>]|(?:[^\S\n\r])*)*` — which made a failing match
// explore every partition of a whitespace run: ~15 SECONDS on a line with
// 28 leading spaces (the chat-UI right-alignment shape). The fix gives the
// whitespace arm exactly one admissible parse per run:
// `(?:[^\S\n\r])+(?![^\S\n\r])` — byte-identical captures on every match
// (verified by brute force over all short strings of the relevant alphabet),
// linear-ish on failure.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GRAMMAR_PATH = join(
  __dirname,
  "../../../language/sparkdown.language-grammar.json",
);

const grammar = JSON.parse(readFileSync(GRAMMAR_PATH, "utf8"));

/** Collect every regex-bearing string in the grammar (match/begin/end/while). */
function collectPatterns(): { where: string; source: string }[] {
  const out: { where: string; source: string }[] = [];
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
    } else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (
          typeof v === "string" &&
          (k === "match" || k === "begin" || k === "end" || k === "while")
        ) {
          out.push({ where: `${path}.${k}`, source: v });
        } else {
          walk(v, `${path}.${k}`);
        }
      }
    }
  };
  walk(grammar, "$");
  return out;
}

describe("grammar regex safety (#280)", () => {
  test("no pattern quantifies a group containing a nullable whitespace-star alternative", () => {
    // The exact bomb shape: an alternation arm `(?:[^\S\n\r])*` (nullable)
    // inside a `*`- or `+`-quantified group. Nullable arms multiply the
    // backtracking paths over whitespace runs combinatorially.
    const bombArm = String.raw`|(?:[^\S\n\r])*)`;
    const bombArmFirst = String.raw`((?:[^\S\n\r])*|`;
    const offenders = collectPatterns().filter(
      ({ source }) =>
        source.includes(bombArm + "*") ||
        source.includes(bombArm + "+") ||
        source.includes(bombArmFirst),
    );
    expect(
      offenders.map((o) => o.where),
      "quantified groups must not contain a nullable whitespace-star alternative " +
        "(each iteration must consume at least one character, uniquely)",
    ).toEqual([]);
  });

  test("ParentheticalLine fails fast on a deeply indented non-matching line", () => {
    const source = grammar.repository?.ParentheticalLine?.match;
    expect(source, "ParentheticalLine.match exists").toBeTruthy();
    const re = new RegExp(source, "muy");
    // 28 leading spaces + no parenthetical: the pre-fix pattern took ~15s
    // here; the fixed one takes microseconds. The generous bound keeps the
    // assertion deterministic on slow CI while still failing catastrophic
    // regressions by orders of magnitude.
    const line = " ".repeat(28) + "[Seen 7:21 PM]";
    re.lastIndex = 0;
    const t0 = performance.now();
    const result = re.exec(line);
    const ms = performance.now() - t0;
    expect(result).toBeNull();
    expect(ms, `ParentheticalLine took ${ms.toFixed(1)}ms on the adversarial line`).toBeLessThan(250);
  });

  test("every grammar pattern completes quickly on whitespace-heavy adversarial lines", () => {
    // Broad sweep: no pattern in the grammar should take pathological time
    // on the shapes that detonate nullable-arm stars.
    const adversarials = [
      " ".repeat(28) + "[Seen 7:21 PM]",
      " ".repeat(28) + "x".repeat(20),
      "\t".repeat(28) + "(",
      " ".repeat(28) + "= < unclosed",
    ];
    const slow: string[] = [];
    for (const { where, source } of collectPatterns()) {
      let re: RegExp;
      try {
        re = new RegExp(source, "muy");
      } catch {
        continue; // engine tolerates uncompilable patterns; not our concern
      }
      for (const line of adversarials) {
        re.lastIndex = 0;
        const t0 = performance.now();
        re.exec(line);
        if (performance.now() - t0 > 100) {
          slow.push(`${where} on ${JSON.stringify(line.slice(0, 20))}...`);
          break;
        }
      }
    }
    expect(slow, "patterns exceeding 100ms on adversarial lines").toEqual([]);
  });
});

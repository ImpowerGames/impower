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
    const line = " ".repeat(28) + "[Seen 7:21 PM]";
    re.lastIndex = 0;
    const t0 = performance.now();
    const result = re.exec(line);
    const ms = performance.now() - t0;
    expect(result).toBeNull();
    expect(ms, `ParentheticalLine took ${ms.toFixed(1)}ms on the adversarial line`).toBeLessThan(250);
  });

  test("every grammar pattern completes quickly on whitespace-heavy adversarial lines", () => {
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
        continue;
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

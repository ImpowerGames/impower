// Reports and rewrites the baseline of existing grammar findings.
//
//   node packages/eslint-plugin-sparkdown-grammar/src/baseline-cli.ts
//       Print each baselined rule's findings on the grammar, with the
//       owners whose counts rose (the lint fails on these) or fell (the
//       baseline can shrink).
//   node packages/eslint-plugin-sparkdown-grammar/src/baseline-cli.ts --write
//       Rewrite baseline.json from the grammar as it is now.
//
// Run either from any directory. Lower the baseline when a fix removes
// findings, so the debt cannot quietly come back; raise it only for debt
// that a reviewer accepted.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Linter, type Rule } from "eslint";
import yml from "eslint-plugin-yml";
import { BASELINED_RULES, BASELINE_FILE } from "./index.ts";
import type { BaselinedRule, Finding } from "./utils/baseline.ts";
import { find as tagNameSymmetry } from "./rules/tag-name-symmetry.ts";
import { find as lookaround } from "./rules/lookaround-needs-rival-comment.ts";
import { find as unreferencedRule } from "./rules/no-unreferenced-rule.ts";
import { find as unreferencedVariable } from "./rules/no-unreferenced-variable.ts";
import { find as repeatedFragment } from "./rules/no-repeated-fragment.ts";
import { find as longPattern } from "./rules/name-long-pattern-parts.ts";
import { find as scopedEnd } from "./rules/scoped-end-has-bailout.ts";
import { find as lineCrossingClass } from "./rules/no-line-crossing-class.ts";

const GRAMMAR = fileURLToPath(
  new URL(
    "../../../definitions/yaml/sparkdown.language-grammar.yaml",
    import.meta.url,
  ),
);

const FINDERS: Record<(typeof BASELINED_RULES)[number], BaselinedRule["find"]> = {
  "tag-name-symmetry": tagNameSymmetry,
  "lookaround-needs-rival-comment": lookaround,
  "no-unreferenced-rule": unreferencedRule,
  "no-unreferenced-variable": unreferencedVariable,
  "no-repeated-fragment": repeatedFragment,
  "name-long-pattern-parts": longPattern,
  "scoped-end-has-bailout": scopedEnd,
  "no-line-crossing-class": lineCrossingClass,
};

export type Baseline = Record<string, Record<string, number>>;

// Every baselined rule's findings on `source`, before any baseline.
export function collectFindings(
  source: string,
  filename = "grammar.yaml",
): Record<string, Finding[]> {
  const collected: Record<string, Finding[]> = {};
  const rules: Record<string, Rule.RuleModule> = {};
  for (const name of BASELINED_RULES) {
    collected[name] = [];
    rules[name] = {
      create(context) {
        return {
          "Program:exit"() {
            collected[name]!.push(...FINDERS[name](context));
          },
        };
      },
    };
  }
  const linter = new Linter({ configType: "flat" });
  const messages = linter.verify(
    source,
    [
      ...(yml.configs["flat/base"] as Linter.Config[]),
      {
        files: [filename],
        plugins: { collect: { rules } },
        rules: Object.fromEntries(
          BASELINED_RULES.map((name) => [`collect/${name}`, "error"]),
        ),
      },
    ],
    filename,
  );
  const fatal = messages.find((m) => m.fatal);
  if (fatal) throw new Error(`could not parse the grammar: ${fatal.message}`);
  return collected;
}

export function countByOwner(findings: Record<string, Finding[]>): Baseline {
  const baseline: Baseline = {};
  for (const name of Object.keys(findings).sort()) {
    const counts: Record<string, number> = {};
    for (const finding of findings[name]!) {
      counts[finding.owner] = (counts[finding.owner] ?? 0) + 1;
    }
    baseline[name] = Object.fromEntries(
      Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  }
  return baseline;
}

function main(): number {
  const findings = collectFindings(readFileSync(GRAMMAR, "utf8"));
  const current = countByOwner(findings);
  if (process.argv.includes("--write")) {
    writeFileSync(BASELINE_FILE, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`wrote ${fileURLToPath(BASELINE_FILE)}`);
  }
  const saved = JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Baseline;
  let over = 0;
  for (const name of BASELINED_RULES) {
    const list = findings[name]!;
    const kinds = new Map<string, number>();
    for (const f of list) {
      const kind = f.data?.["kind"] ?? f.messageId;
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    }
    const breakdown = [...kinds].map(([k, n]) => `${k} ${n}`).join(", ");
    const owners = Object.keys(current[name] ?? {}).length;
    console.log(`${name}: ${list.length} findings in ${owners} owners (${breakdown})`);
    const allowed = saved[name] ?? {};
    const now = current[name] ?? {};
    for (const owner of new Set([...Object.keys(allowed), ...Object.keys(now)])) {
      const a = allowed[owner] ?? 0;
      const n = now[owner] ?? 0;
      if (n > a) {
        over++;
        console.log(`  over:  ${owner} has ${n}, baseline allows ${a}`);
      } else if (n < a) {
        console.log(`  fell:  ${owner} has ${n}, baseline allows ${a}`);
      }
    }
  }
  return over > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}

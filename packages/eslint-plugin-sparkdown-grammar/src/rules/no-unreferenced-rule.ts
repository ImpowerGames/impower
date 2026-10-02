// Rule: every repository rule must be reachable from the grammar's
// top-level `patterns:` through `include: "#Name"` references (GRAMMAR.md
// §7). A rule nothing reaches never matches, but still reads as live to
// the next author and inflates every count the other rules report. A rule
// included only by other unreachable rules is unreachable too.
//
// A rule that TypeScript reads by name without the parser ever producing
// it (for example a pattern compiled straight from
// `GRAMMAR_DEFINITION.repository`) is exempt when the comment block
// directly above its key carries `# referenced-from: <file>`; that rule's
// own includes then count as reachable as well.
//
// This walk is the same as the `grammarReachability` test in
// packages/sparkdown/src/tests/compiler/: its known-unreachable list and
// this rule's baseline name the same rules.

import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import {
  findPair,
  isMapping,
} from "../utils/yaml-ast.ts";
import {
  getGrammarIndex,
  includesUnder,
  markedComment,
} from "../utils/grammar-index.ts";

export const REFERENCED_FROM = "referenced-from:";

const { rule, find } = defineBaselinedRule(
  {
    type: "suggestion",
    docs: {
      description:
        "Disallow repository rules that no `include` reaches from the top-level `patterns:`.",
    },
    messages: {
      unreachable: `Rule \`{{name}}\` is not reachable from the top-level \`patterns:\` through any \`include\`, so it never matches. Remove it, include it where it belongs, or, if TypeScript reads it by name, say where with a \`# referenced-from:\` comment above it. See GRAMMAR.md §7.${BASELINE_NOTE}`,
    },
  },
  (context) => {
    const index = getGrammarIndex(context);
    if (!index.root) return [];
    const queue: string[] = [];
    const patterns = findPair(index.root, "patterns");
    if (patterns) queue.push(...includesUnder(patterns.value));
    for (const [name, pair] of index.rules) {
      if (markedComment(index, [pair.loc.start.line], REFERENCED_FROM)) {
        queue.push(name);
      }
    }
    const reached = new Set<string>();
    while (queue.length > 0) {
      const name = queue.pop()!;
      if (reached.has(name)) continue;
      reached.add(name);
      const pair = index.rules.get(name);
      if (pair && isMapping(pair.value)) queue.push(...includesUnder(pair.value));
    }
    const findings: Finding[] = [];
    for (const [name, pair] of index.rules) {
      if (reached.has(name)) continue;
      findings.push({
        owner: `repository.${name}`,
        loc: pair.key?.loc ?? pair.loc,
        messageId: "unreachable",
        data: { name },
      });
    }
    return findings;
  },
);

export { find };
export default rule;

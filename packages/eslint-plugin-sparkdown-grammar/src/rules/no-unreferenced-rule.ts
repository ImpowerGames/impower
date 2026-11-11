import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import {
  findPair,
  getStringValue,
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
    for (const document of index.grammar.documents) {
      if (!document.root) continue;
      const patterns = findPair(document.root, "patterns");
      if (patterns) queue.push(...includesUnder(patterns.value));
      const luauFile = findPair(document.root, "luauFile");
      if (luauFile && isMapping(luauFile.value)) {
        const root = getStringValue(luauFile.value, "rule");
        if (root) queue.push(root.value);
      }
      for (const [name, pair] of document.rules) {
        if (markedComment(document, [pair.loc.start.line], REFERENCED_FROM)) {
          queue.push(name);
        }
      }
    }
    const reached = new Set<string>();
    while (queue.length > 0) {
      const name = queue.pop()!;
      if (reached.has(name)) continue;
      reached.add(name);
      const pair = index.grammar.rules.get(name);
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

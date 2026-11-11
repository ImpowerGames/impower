import { relative } from "node:path";
import type { Rule } from "eslint";
import {
  currentFile,
  getGrammarIndex,
  grammarSources,
} from "../utils/grammar-index.ts";

const isLuauRuleName = (name: string): boolean => name.startsWith("Luau");
const isLuauVariableName = (name: string): boolean =>
  name.replace(/^_/, "").startsWith("LUAU_");

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep every `Luau*` rule and `LUAU_*` variable in the Luau grammar source, and every other rule and variable in the story grammar source.",
    },
    schema: [],
    messages: {
      luauInStory:
        "{{kind}} `{{name}}` has the Luau prefix, so it belongs in {{luau}}, not the story grammar source. See GRAMMAR.md §1.4.",
      storyInLuau:
        "{{kind}} `{{name}}` has no Luau prefix (`Luau` for a rule, `LUAU_` for a variable), so it belongs in {{story}}, not the Luau grammar source. See GRAMMAR.md §1.4.",
    },
  },
  create(context) {
    return {
      "Program:exit"() {
        const sources = grammarSources(context);
        const self = currentFile(context);
        const inLuau = self === sources.luau;
        if (!inLuau && self !== sources.story) return;
        const index = getGrammarIndex(context);
        const entries = [
          ...[...index.rules].map(([name, pair]) => ({
            kind: "Rule",
            name,
            pair,
            luau: isLuauRuleName(name),
          })),
          ...[...index.variables].map(([name, pair]) => ({
            kind: "Variable",
            name,
            pair,
            luau: isLuauVariableName(name),
          })),
        ];
        for (const { kind, name, pair, luau } of entries) {
          if (luau === inLuau) continue;
          context.report({
            loc: pair.key?.loc ?? pair.loc,
            messageId: inLuau ? "storyInLuau" : "luauInStory",
            data: {
              kind,
              name,
              luau: relative(context.cwd, sources.luau ?? ""),
              story: relative(context.cwd, sources.story ?? ""),
            },
          });
        }
      },
    };
  },
};

export default rule;

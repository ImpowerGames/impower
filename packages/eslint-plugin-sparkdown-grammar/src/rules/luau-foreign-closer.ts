// Rule: a closer-bounded Luau rule ends before a closer it did not open, as
// Luau's parser stops there, so the rule that owns the closer reads it and
// the converter reports Luau's error for what is missing (GRAMMAR.md §3.2,
// §17.2). Over the rules `luau-unread-token` finds closer-bounded (an `end:`
// that consumes a closer and no ordinary token, or a rule that holds
// `#LuauBlockBody`), the `end:`, with its variables substituted, must match
// with nothing at:
//
// - an `end` and an `until` it does not consume, written at once or after
//   whitespace, for every such rule: the catch-all (`LuauUnreadToken`)
//   refuses both, and a block around the rule may own either;
// - a `)`, a `]` and a `}` it does not consume, the same way, for a bracket
//   (a rule whose `end:` consumes a bracket closer, a type's `>` or `>>`):
//   Luau's expression parser stops at any of them (`{ f(1 }` closes the
//   call before the `}`, which the table takes). A block does not end at
//   one, since Luau's block parser reads it as a statement's error.
//
// `else` and `elseif` are not checked: an `if` takes its own branches, so
// which rules own them is the `if`'s structure, not a closer it can meet.
// The beat a body or bracket bails out at is `scoped-end-has-bailout`'s.
// The rules `luau-unread-token` exempts are exempt here, and so are the
// bodies that stand outermost in Luau code, which take only their own
// closer and read any other as `LuauStrayCloser` (`EXEMPT`); a rule with
// `applyEndPatternLast` tries its content first, so its end is not checked.

import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { getGrammarIndex } from "../utils/grammar-index.ts";
import { findPair, isScalar } from "../utils/yaml-ast.ts";
import { closerBounded, exemption as unreadTokenExemption } from "./luau-unread-token.ts";

const KEYWORD_CLOSERS = ["end", "until"];
const BRACKET_CLOSERS = [")", "]", "}"];
// The closers a rule's `end:` consuming them makes it a bracket.
const BRACKET_OWNERS = new Set([...BRACKET_CLOSERS, ">", ">>"]);
// The closer written at once and after whitespace.
const PREFIXES = ["", " ", "\t"];

// The closer-bounded rules that end only at their own closer, by the names
// they share and the reason.
export const EXEMPT: readonly { names: RegExp; reason: string }[] = [
  {
    names: /^Luau(?:FunctionDefinition|FunctionBody|MethodDefinition|Define|FunctionTypeDeclaration|SparkleHandlerClosure)$/,
    reason:
      "the outermost body of Luau code, a function's, a method's, a define's, a type function's or a sparkle handler's, which takes only its own closer and reads any other as `LuauStrayCloser`, so a stray `until` stays in it instead of ending the function",
  },
];

export function exemption(name: string): string | undefined {
  return EXEMPT.find((entry) => entry.names.test(name))?.reason ?? unreadTokenExemption(name);
}

// Whether the end matches with nothing before a closer, written at once and after whitespace.
function yieldsAt(regex: RegExp, token: string): boolean {
  return PREFIXES.every((prefix) => {
    regex.lastIndex = 0;
    const match = regex.exec(`${prefix}${token} x\n`);
    return match !== null && match.index === 0 && match[0].length === 0;
  });
}

const { rule, find } = defineBaselinedRule(
  {
    type: "problem",
    docs: {
      description:
        "Require every closer-bounded Luau rule's `end:` to end, with nothing, before a closer it did not open.",
    },
    messages: {
      foreign: `{{name}} is closer-bounded ({{why}}), so its \`end:\` must end with nothing before \`{{closer}}\`, a closer it did not open, as Luau's parser stops there: add the lookahead its kind shares (\`LUAU_CLOSER\` for a block, \`LUAU_NOT_PARENTHESIS_CLOSER\` and the like for a bracket). See GRAMMAR.md §3.2, §17.2.${BASELINE_NOTE}`,
    },
  },
  (context) => {
    const index = getGrammarIndex(context);
    const findings: Finding[] = [];
    for (const { owner, mapping } of index.ruleMappings) {
      if (owner.kind !== "rule" || !owner.name.startsWith("Luau") || exemption(owner.name) !== undefined) continue;
      const endLast = findPair(mapping, "applyEndPatternLast");
      if (endLast && isScalar(endLast.value) && endLast.value.value === true) continue;
      const bounded = closerBounded(index, mapping);
      if (!bounded) continue;
      const bracket = bounded.closer !== undefined && BRACKET_OWNERS.has(bounded.closer);
      const closers = [...KEYWORD_CLOSERS, ...(bracket ? BRACKET_CLOSERS : [])].filter((token) => token !== bounded.closer);
      const missing = closers.find((token) => !yieldsAt(bounded.regex, token));
      if (missing === undefined) continue;
      const end = findPair(mapping, "end")!;
      const inline = owner.pair?.value !== mapping;
      findings.push({
        owner: owner.id,
        loc: end.value!.loc,
        messageId: "foreign",
        data: {
          name: `${owner.name}${inline ? " (inline rule)" : ""}`,
          why: bounded.why,
          closer: missing,
        },
      });
    }
    return findings;
  },
);

export { find };
export default rule;

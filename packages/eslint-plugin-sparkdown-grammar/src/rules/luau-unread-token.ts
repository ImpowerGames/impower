// Rule: a pure-Luau body or bracket tiles with `LuauUnreadToken`, the
// catch-all that takes a token no other pattern of the rule reads, so the
// rule never closes before its closer (GRAMMAR.md §3.2, §13.2, §17.2).
// Three findings, over the `Luau` rules (the rest are Sparkdown's narrative
// syntax):
//
// - A closer-bounded rule must end its `patterns:` with
//   `#LuauUnreadToken`. A `begin`/`end` rule is closer-bounded when its
//   `end:` consumes a closer (`end`, `until`, `)`, `]`, `}`, `>>` or a
//   type's `>`) and no ordinary token, or when it holds a block's body
//   (`#LuauBlockBody`), which its block's closer ends.
// - A rule whose `end:` consumes nothing (every alternative zero-width)
//   and that is not closer-bounded must not include it, directly or
//   through a `Switch` rule: it ends where its content stops matching, so
//   the catch-all would take the construct after it (`if a == (1)then`
//   would read `then` into the parenthetical).
// - A rule with `applyEndPatternLast` must not include it either: its
//   content is tried before its end, so the catch-all would take the
//   closer and the end would never match.
//
// The check is behavioural, as `scoped-end-has-bailout`'s is: the `end:`
// pattern, with its variables substituted, runs at probe positions before
// each closer and each ordinary token. A pattern JavaScript cannot compile
// is skipped. Rules that are closer-bounded but tile some other way are
// named in `EXEMPT` with the reason.

import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { getGrammarIndex, type GrammarIndex } from "../utils/grammar-index.ts";
import { findPair, isMapping, isScalar, isSequence, type YAMLMapping } from "../utils/yaml-ast.ts";
import { resolveVariables, withoutBackreferences } from "./scoped-end-has-bailout.ts";

export const UNREAD_TOKEN = "LuauUnreadToken";
const BLOCK_BODY = "LuauBlockBody";

const CLOSERS = ["end", "until", ")", "]", "}", ">>", ">"];
// Ordinary tokens, which a closer-bounded end never consumes.
const ORDINARY = ["a", "x1", "7", "+", "\"s\"", "then", ","];
// Text before the probed token: none, whitespace, a name and a bracket.
const PREFIXES = ["", " ", "\t", "x", "x ", ")"];

// The closer-bounded rules that are not pure-Luau bodies or brackets, by
// the names they share and the reason.
export const EXEMPT: readonly { names: RegExp; reason: string }[] = [
  {
    names: /^LuauSparkdown/,
    reason:
      "Luau read at story scope: a narrative body tiles with story text already, and an `&` statement reads what its rules cannot with `LuauInvalidStatementToken` and ends at its line, where only a bracket, which is the tiled Luau rule, carries it on",
  },
  {
    names: /^Luau(?:Style|Animation|Theme|Morph|Layout|Screen|Component)$|^LuauStruct|^LuauSparkle(?!HandlerClosure$)/,
    reason: "a struct or layout block, whose lines are the entries its lowerer reads, not Luau statements",
  },
  {
    names: /^Luau(?:InterpolatedStringExpression|DoubleQuotedStringInterpolation|FunctionCallShorthand|DoubleQuotedFunctionCallShorthand)$/,
    reason: "Sparkdown's interpolation in story text or a double-quoted string, where an unclosed brace would take the story after it",
  },
  {
    names: /^LuauRegexCharacterClass$/,
    reason: "a regular expression's character class, which holds the expression's text, not Luau tokens",
  },
];

export function exemption(name: string): string | undefined {
  return EXEMPT.find((entry) => entry.names.test(name))?.reason;
}

/**
 * Why a `begin`/`end` rule is closer-bounded, with the closer its `end:`
 * consumes (none for a rule that holds a block's body and consumes no
 * closer) and its compiled `end:`; undefined when it is not, or when its
 * `end:` does not compile.
 */
export function closerBounded(
  index: GrammarIndex,
  mapping: YAMLMapping,
): { why: string; closer?: string; regex: RegExp } | undefined {
  const end = findPair(mapping, "end");
  if (!findPair(mapping, "begin") || !end || !isScalar(end.value) || typeof end.value.value !== "string") return undefined;
  const regex = compile(index, end.value.value);
  if (!regex) return undefined;
  const consumed = CLOSERS.find((token) => consumes(regex, token));
  const closer = consumed !== undefined && !ORDINARY.some((token) => consumes(regex, token)) ? consumed : undefined;
  if (patternIncludes(mapping).includes(BLOCK_BODY)) return { why: `it holds \`#${BLOCK_BODY}\``, closer, regex };
  if (closer !== undefined) return { why: `its \`end:\` consumes \`${closer}\``, closer, regex };
  return undefined;
}

function compile(index: GrammarIndex, end: string): RegExp | null {
  try {
    return new RegExp(withoutBackreferences(resolveVariables(index, end, false)), "muy");
  } catch {
    return null;
  }
}

// The length of the match at `at`, or -1 for none.
function matchLength(regex: RegExp, text: string, at: number): number {
  regex.lastIndex = at;
  const match = regex.exec(text);
  return match ? match[0].length : -1;
}

// Whether the end, run at the token or at the whitespace before it, takes
// the whole token.
function consumes(regex: RegExp, token: string): boolean {
  return PREFIXES.some((prefix) => {
    const text = `${prefix}${token} x\n`;
    const at = prefix.length;
    const from = prefix.endsWith(" ") || prefix.endsWith("\t") ? at - 1 : at;
    for (let i = from; i <= at; i++) {
      if (matchLength(regex, text, i) >= at - i + token.length) return true;
    }
    return false;
  });
}

// Whether the end ever matches with a length, at any probe.
function consumesAnything(regex: RegExp): boolean {
  for (const token of [...CLOSERS, ...ORDINARY, ""]) {
    for (const prefix of PREFIXES) {
      const text = `${prefix}${token} x\n`;
      for (let i = 0; i <= prefix.length; i++) if (matchLength(regex, text, i) > 0) return true;
    }
  }
  return false;
}

function patternIncludes(mapping: YAMLMapping): string[] {
  const pair = findPair(mapping, "patterns");
  if (!pair || !isSequence(pair.value)) return [];
  const names: string[] = [];
  for (const entry of pair.value.entries) {
    if (!isMapping(entry)) {
      names.push("");
      continue;
    }
    const include = findPair(entry, "include");
    const target = include && isScalar(include.value) && typeof include.value.value === "string" ? include.value.value : "";
    names.push(target.startsWith("#") ? target.slice(1) : "");
  }
  return names;
}

// Whether a rule's `patterns:` include the catch-all, directly or through
// rules that hold only `patterns:` (a `Switch`).
function includesUnreadToken(index: GrammarIndex, mapping: YAMLMapping, seen = new Set<string>()): boolean {
  for (const name of patternIncludes(mapping)) {
    if (name === UNREAD_TOKEN) return true;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const pair = index.rules.get(name);
    if (!pair || !isMapping(pair.value)) continue;
    const isSwitch = ["match", "begin", "end"].every((key) => !findPair(pair.value as YAMLMapping, key));
    if (isSwitch && includesUnreadToken(index, pair.value, seen)) return true;
  }
  return false;
}

const { rule, find } = defineBaselinedRule(
  {
    type: "problem",
    docs: {
      description:
        "Require `#LuauUnreadToken` last in every closer-bounded Luau rule, and refuse it in a zero-width-end or `applyEndPatternLast` rule.",
    },
    messages: {
      missing: `{{name}} is closer-bounded ({{why}}), so its \`patterns:\` must end with \`{ include: "#${UNREAD_TOKEN}" }\`, or a token none of them reads closes it before its closer. See GRAMMAR.md §3.2, §17.2.${BASELINE_NOTE}`,
      zeroWidth: `{{name}}'s \`end:\` consumes nothing, so it ends where its content stops matching; \`#${UNREAD_TOKEN}\` would take the construct after it. See GRAMMAR.md §3.2, §17.2.${BASELINE_NOTE}`,
      endLast: `{{name}} has \`applyEndPatternLast\`, so \`#${UNREAD_TOKEN}\` would take its closer before the end could match. See GRAMMAR.md §3.2, §17.2.${BASELINE_NOTE}`,
    },
  },
  (context) => {
    const index = getGrammarIndex(context);
    const findings: Finding[] = [];
    for (const { owner, mapping } of index.ruleMappings) {
      if (owner.kind !== "rule" || !owner.name.startsWith("Luau")) continue;
      const inline = owner.pair?.value !== mapping;
      const name = `${owner.name}${inline ? " (inline rule)" : ""}`;
      const included = includesUnreadToken(index, mapping);
      const endLast = findPair(mapping, "applyEndPatternLast");
      if (endLast && isScalar(endLast.value) && endLast.value.value === true) {
        if (included) findings.push({ owner: owner.id, loc: endLast.loc, messageId: "endLast", data: { name } });
        continue;
      }
      const end = findPair(mapping, "end");
      if (!findPair(mapping, "begin") || !end || !isScalar(end.value) || typeof end.value.value !== "string") continue;
      const regex = compile(index, end.value.value);
      if (!regex) continue;
      const includes = patternIncludes(mapping);
      const bounded = closerBounded(index, mapping);
      if (bounded !== undefined) {
        if (exemption(owner.name) !== undefined || includes[includes.length - 1] === UNREAD_TOKEN) continue;
        findings.push({ owner: owner.id, loc: end.value.loc, messageId: "missing", data: { name, why: bounded.why } });
      } else if (included && !consumesAnything(regex)) {
        findings.push({ owner: owner.id, loc: end.value.loc, messageId: "zeroWidth", data: { name } });
      }
    }
    return findings;
  },
);

export { find };
export default rule;

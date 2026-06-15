// Rule: refuse lookaheads/lookbehinds that attempt to span newlines in
// any `match:` / `begin:` / `end:` pattern. VS Code's TextMate engine
// tokenizes one line at a time, so a lookaround that wants to read
// content from the previous or next line cannot — the lookaround
// silently fails to match in VS Code even though our textmate-grammar-
// tree runtime parser may accept it. The result is highlighting
// (driven by VS Code) and the runtime parse tree diverging.
//
// Two distinct hazards, two different rules:
//
// 1. `\s` *anywhere inside a lookaround* — `\s` matches `\n` along
//    with horizontal whitespace, and inside a lookaround that almost
//    always means "I want to skip arbitrary whitespace, possibly
//    crossing lines" — which doesn't work in VS Code. Use `{{WS}}`
//    (horizontal whitespace only) instead, or restructure the rule
//    so the cross-line consumption happens inside the scope's
//    `patterns:` list (see GRAMMAR.md §11.5).
//
// 2. ANY newline-matching token (`\n`, `\r`, `\s`, `{{NL}}`) *inside
//    a lookbehind* (`(?<=…)` / `(?<!…)`) — VS Code's line-by-line
//    tokenizer never carries the previous line's content into the
//    current line's input, so a lookbehind that needs to see across
//    the line boundary will silently fail. Lookbehinds with newline
//    refs are almost always "look back to the start of the previous
//    line for an `if` keyword" or similar — a structural pattern
//    that has to be re-expressed (see GRAMMAR.md §11.5 for the
//    "open scope on one line, consume across lines via patterns
//    array" idiom).
//
// Bare `\n` / `\r` / `{{NL}}` in a *lookahead* (`(?=…)` / `(?!…)`)
// are deliberately NOT flagged — they're routinely used as terminal
// newline anchors like `(?=\r\n|\r|\n)` that fire ON the newline
// character without trying to read past it, and that shape works
// in VS Code.

import type { Rule } from "eslint";
import {
  findPair,
  isMapping,
  isRuleMapping,
  isScalar,
  type YAMLMapping,
  type YAMLScalar,
} from "../utils/yaml-ast.ts";

const PATTERN_KEYS = ["match", "begin", "end"] as const;

interface NewlineHit {
  // Source offset within the scalar value.
  offset: number;
  // Length of the offending token (e.g. 2 for `\n`, 4 for `{{NL}}`).
  length: number;
  // Human label for the diagnostic.
  label: string;
}

// Group context: NONE = outside lookaround, AHEAD = inside `(?=…)`
// or `(?!…)`, BEHIND = inside `(?<=…)` or `(?<!…)`.
type LookKind = "NONE" | "AHEAD" | "BEHIND";

// Scan a regex source for newline-spanning shapes inside lookaround
// groups. Tracks group nesting and remembers, per depth, whether the
// enclosing group is a lookahead, a lookbehind, or neither. Skips
// content inside `[…]` character classes (which can't span lines).
function findNewlineInLookaround(source: string): NewlineHit[] {
  const hits: NewlineHit[] = [];
  const stack: LookKind[] = [];
  const currentLookKind = (): LookKind => {
    // The innermost lookaround wins. If any enclosing group is a
    // lookbehind, treat as BEHIND (more restrictive); otherwise if
    // any is a lookahead, AHEAD; else NONE.
    let result: LookKind = "NONE";
    for (const kind of stack) {
      if (kind === "BEHIND") return "BEHIND";
      if (kind === "AHEAD") result = "AHEAD";
    }
    return result;
  };

  let i = 0;
  let inCharClass = false;
  while (i < source.length) {
    const ch = source[i]!;

    // Escapes — skip the next char (after maybe flagging).
    if (ch === "\\") {
      const next = source[i + 1];
      if (!inCharClass) {
        const look = currentLookKind();
        if (look !== "NONE" && next === "s") {
          // `\s` matches `\n` — almost always wrong inside any lookaround.
          hits.push({
            offset: i,
            length: 2,
            label: "`\\s` (matches `\\n`)",
          });
        } else if (
          look === "BEHIND" &&
          (next === "n" || next === "r")
        ) {
          // `\n` / `\r` inside a lookbehind: VS Code can't see the
          // previous line, so the lookbehind silently fails.
          hits.push({
            offset: i,
            length: 2,
            label: `\`\\${next}\` inside lookbehind`,
          });
        }
      }
      i += next === undefined ? 1 : 2;
      continue;
    }

    if (inCharClass) {
      if (ch === "]") inCharClass = false;
      i++;
      continue;
    }
    if (ch === "[") {
      inCharClass = true;
      i++;
      continue;
    }

    // `{{NL}}` variable reference inside a lookbehind. (Inside a
    // lookahead, `{{NL}}` typically means a terminal newline anchor
    // which is safe.)
    if (ch === "{" && source[i + 1] === "{" && currentLookKind() === "BEHIND") {
      const close = source.indexOf("}}", i + 2);
      if (close >= 0) {
        const name = source.slice(i + 2, close);
        if (name === "NL") {
          hits.push({
            offset: i,
            length: close + 2 - i,
            label: "`{{NL}}` inside lookbehind",
          });
        }
        i = close + 2;
        continue;
      }
    }

    if (ch === "(") {
      const head = source.slice(i, i + 4);
      let kind: LookKind = "NONE";
      let consumed = 1;
      if (head.startsWith("(?=") || head.startsWith("(?!")) {
        kind = "AHEAD";
        consumed = 3;
      } else if (head.startsWith("(?<=") || head.startsWith("(?<!")) {
        kind = "BEHIND";
        consumed = 4;
      } else if (head.startsWith("(?:")) {
        consumed = 3;
      } else if (head.startsWith("(?<")) {
        // (?<name> named capture
        consumed = 1;
      }
      stack.push(kind);
      i += consumed;
      continue;
    }
    if (ch === ")") {
      stack.pop();
      i++;
      continue;
    }

    i++;
  }
  return hits;
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow newline-matching tokens (`\\n`, `\\r`, `\\s`, `{{NL}}`) inside lookaround groups — VS Code's TextMate engine can't see across line boundaries.",
    },
    schema: [],
    messages: {
      newlineInLookaround:
        "{{label}} inside a lookaround attempts to span line boundaries. VS Code's TextMate engine tokenizes one line at a time and won't follow the lookaround into the next/previous line — the runtime parse and highlighting will diverge. Restructure the rule (see GRAMMAR.md §11.5).",
    },
  },
  create(context) {
    function reportScalar(scalar: YAMLScalar, source: string): void {
      for (const hit of findNewlineInLookaround(source)) {
        const valueStart = scalar.range[0];
        // Plain (unquoted) scalars map offset 1:1 onto the source.
        // Single-quoted scalars shift by 1. Block scalars (|, >) are
        // not handled precisely — we fall back to the scalar's full
        // loc.
        let startOffset: number | null = null;
        if (scalar.raw === source) {
          startOffset = valueStart + hit.offset;
        } else if (
          scalar.raw.startsWith("'") &&
          scalar.raw.endsWith("'") &&
          scalar.raw.length === source.length + 2 &&
          !source.includes("'")
        ) {
          startOffset = valueStart + 1 + hit.offset;
        }
        if (startOffset !== null) {
          context.report({
            loc: {
              start: context.sourceCode.getLocFromIndex(startOffset),
              end: context.sourceCode.getLocFromIndex(startOffset + hit.length),
            },
            messageId: "newlineInLookaround",
            data: { label: hit.label },
          });
        } else {
          context.report({
            loc: scalar.loc,
            messageId: "newlineInLookaround",
            data: { label: hit.label },
          });
        }
      }
    }

    return {
      YAMLMapping(node: unknown) {
        const mapping = node as YAMLMapping;
        if (!isMapping(mapping)) return;
        if (!isRuleMapping(mapping)) return;
        for (const key of PATTERN_KEYS) {
          const pair = findPair(mapping, key);
          if (
            pair &&
            isScalar(pair.value) &&
            typeof pair.value.value === "string"
          ) {
            reportScalar(pair.value as YAMLScalar, pair.value.value);
          }
        }
      },
    };
  },
};

export default rule;

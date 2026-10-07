// Rule: GRAMMAR.md §11.5, no lookaround may look past its line's break.
// VS Code's TextMate engine tokenizes one line at a time, and the web
// editor hands the tokenizer one line at a time too, so a lookaround that
// wants to read content from the previous or next line never sees it
// there, while the compiler, which parses whole slices of the document,
// does. The result is highlighting and the editor's tree diverging from
// the compiler's tree.
//
// Each rule's `match`, `begin` and `end` is checked with its `{{NAME}}`
// references expanded, since a lookaround and the line break inside it can
// sit on either side of a variable reference, and a variable's own
// lookarounds take effect only where a rule uses it. Three shapes fail:
//
// 1. `\s` inside any lookaround. `\s` matches `\n` along with horizontal
//    whitespace, so it skips whitespace across lines. Use `{{WS}}`
//    (horizontal whitespace only), or restructure the rule so the
//    cross-line consumption happens inside the scope's `patterns:` list.
//
// 2. A line break (`\n`, `\r`, `{{NL}}`, or a character class holding one)
//    inside a lookbehind, which would look back into the previous line.
//
// 3. A line break inside a lookahead with more pattern after it in that
//    lookahead (`(?={{NL}}\S)`), which reads the next line's content, or
//    repeated there (`(?=\n{2})`, `(?=(?:\n)+)`), which needs a second
//    line. A line break that ends its lookahead once (`(?=\r\n|\r|\n)`,
//    `(?=$|{{NL}})`) is an anchor at the line's own end and passes.
//
// A line break is `\n`, `\r`, or a class that names one or `\s`
// (`[\r\n]`, `[\s]`). A rule that should
//    stop before a line that begins with something ends at the start of
//    that line instead (`^(?=…)`), which each tokenizer decides on that
//    line alone.
//
// A negated class such as `[^)]`, which matches a line break without
// naming one, is `no-line-crossing-class`'s to report. A variable that
// reads past the line on purpose carries a `# reads-past-line:` comment
// saying why, and the line breaks it brings into a pattern are not
// reported.

import { defineBaselinedRule, BASELINE_NOTE, type Finding } from "../utils/baseline.ts";
import { getGrammarIndex, markedComment } from "../utils/grammar-index.ts";
import { regexGroups, scanRegex, type RegexGroup } from "../utils/regex-scan.ts";
import { rangeInScalar } from "../utils/yaml-ast.ts";
import { siteLabel } from "./lookaround-needs-rival-comment.ts";
import {
  EXEMPT_MARKER,
  expand,
  isLookahead,
  isLookbehind,
  readsOnAfter,
  repeats,
} from "./no-line-crossing-class.ts";

interface Hit {
  // Offset and length in the expanded pattern.
  start: number;
  length: number;
  label: string;
}

const isLineBreakEscape = (text: string) => text === "\\n" || text === "\\r";

// The hits in an expanded pattern, leaving out the line breaks at the
// offsets `exempt` names (those a `# reads-past-line:` variable brings in).
function findHits(source: string, exempt: (offset: number) => boolean): Hit[] {
  const hits: Hit[] = [];
  const groups = regexGroups(source);
  const enclosing = (at: number) => groups.filter((g) => g.start < at && g.end > at);
  const tokens = [...scanRegex(source)];
  // One hit per lookaround: `{{NL}}` alone holds three line breaks. An
  // exempt line break takes no slot, so it cannot hide a later one.
  const reported = new Set<number>();
  const lineBreak = (start: number, end: number, label: string, within: RegexGroup[]) => {
    const lookaround = within.filter((g) => isLookahead(g) || isLookbehind(g)).sort((a, b) => b.start - a.start)[0];
    if (!lookaround || reported.has(lookaround.start) || exempt(start)) return;
    if (within.some(isLookbehind)) {
      hits.push({ start, length: end - start, label: `${label} inside a lookbehind` });
      reported.add(lookaround.start);
    } else if (readsOnAfter(source, end, groups)) {
      hits.push({ start, length: end - start, label: `${label} with more of its lookahead after it` });
      reported.add(lookaround.start);
    } else if (
      repeats(source, end) ||
      within.some((g) => g.start > lookaround.start && repeats(source, g.end + 1))
    ) {
      hits.push({ start, length: end - start, label: `${label} repeated within its lookahead` });
      reported.add(lookaround.start);
    }
  };
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok.inCharClass) continue;
    const within = enclosing(tok.index);
    if (tok.text === "\\s") {
      if (within.some((g) => isLookahead(g) || isLookbehind(g)) && !exempt(tok.index)) {
        hits.push({ start: tok.index, length: 2, label: "`\\s` (matches `\\n`) inside a lookaround" });
      }
      continue;
    }
    if (isLineBreakEscape(tok.text)) {
      // `\r\n` is one line break.
      const next = tokens[i + 1];
      const pair = tok.text === "\\r" && next?.text === "\\n" && next.index === tok.index + 2;
      const end = tok.index + (pair ? 4 : 2);
      if (pair) i++;
      lineBreak(tok.index, end, `\`${source.slice(tok.index, end)}\``, within);
      continue;
    }
    if (tok.text === "[") {
      // A class that names a line break (`[\r\n]`), or, in a lookahead,
      // `\s` (`[\s]`); a negated class is `no-line-crossing-class`'s. A
      // class with `\s` in a lookbehind is not reported: it reads only the
      // character before the position, which can be the previous line's
      // break only at the start of a line (`LuauSparkleEventClosureAttribute`
      // and `LuauDocParamModifier` use one).
      let close = i + 1;
      while (close < tokens.length && !(tokens[close]!.text === "]" && tokens[close]!.inCharClass)) close++;
      const closeToken = tokens[close];
      if (!closeToken) continue;
      const body = tokens.slice(i + 1, close);
      const namesLineBreak = body.some((t) => isLineBreakEscape(t.text));
      const holdsSpace = body.some((t) => t.text === "\\s") && !within.some(isLookbehind);
      if (body[0]?.text !== "^" && (namesLineBreak || holdsSpace)) {
        const end = closeToken.index + 1;
        lineBreak(tok.index, end, `\`${source.slice(tok.index, end)}\``, within);
      }
      i = close;
    }
  }
  return hits;
}

const { rule, find } = defineBaselinedRule(
  {
    type: "problem",
    docs: {
      description:
        "Disallow a lookaround that reads past its line's break: `\\s` in a lookaround, a line break in a lookbehind, or a line break with more pattern after it in a lookahead, with `{{NAME}}` references expanded.",
    },
    messages: {
      newlineInLookaround: `{{site}}: {{label}}{{from}} reads across a line boundary. VS Code's TextMate engine and the web editor tokenize one line at a time and never show the lookaround the other line, so their tree diverges from the compiler's. End at the start of the next line instead (\`^(?=…)\`), or restructure the rule (see GRAMMAR.md §11.5).${BASELINE_NOTE}`,
    },
  },
  (context) => {
    const index = getGrammarIndex(context);
    const exempt = (name: string) => {
      const pair = index.variables.get(name);
      return pair !== undefined && markedComment(index, [pair.loc.start.line], EXEMPT_MARKER) !== null;
    };
    const findings: Finding[] = [];
    for (const site of index.patternSites) {
      // A variable is checked where a rule uses it, with the pattern around it.
      if (site.owner.kind === "variable") continue;
      const expanded = expand(site.source, index);
      const exemptAt = (offset: number) => expanded.variables[offset]!.some(exempt);
      for (const hit of findHits(expanded.text, exemptAt)) {
        const chain = expanded.variables[hit.start]!;
        const raw = expanded.rawOffset[hit.start]!;
        findings.push({
          owner: site.owner.id,
          loc: raw >= 0 ? rangeInScalar(context, site.scalar, raw, hit.length) : site.scalar.loc,
          messageId: "newlineInLookaround",
          data: {
            site: siteLabel(site),
            label: hit.label,
            from: chain.length > 0 ? ` (from variable ${chain[0]})` : "",
          },
        });
      }
    }
    return findings;
  },
);

export { find };
export default rule;

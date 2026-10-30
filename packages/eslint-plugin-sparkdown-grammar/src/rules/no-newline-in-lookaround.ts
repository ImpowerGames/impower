import { defineBaselinedRule, BASELINE_NOTE, type Finding } from "../utils/baseline.ts";
import { getGrammarIndex } from "../utils/grammar-index.ts";
import { regexGroups, scanRegex, type RegexGroup } from "../utils/regex-scan.ts";
import { rangeInScalar } from "../utils/yaml-ast.ts";
import { siteLabel } from "./lookaround-needs-rival-comment.ts";
import { expand, isLookahead, isLookbehind, readsOnAfter, repeats } from "./no-line-crossing-class.ts";

interface Hit {
  start: number;
  length: number;
  label: string;
}

const isLineBreakEscape = (text: string) => text === "\\n" || text === "\\r";

function findHits(source: string): Hit[] {
  const hits: Hit[] = [];
  const groups = regexGroups(source);
  const enclosing = (at: number) => groups.filter((g) => g.start < at && g.end > at);
  const tokens = [...scanRegex(source)];
  const reported = new Set<number>();
  const lineBreak = (start: number, end: number, label: string, within: RegexGroup[]) => {
    const lookaround = within.filter((g) => isLookahead(g) || isLookbehind(g)).sort((a, b) => b.start - a.start)[0];
    if (!lookaround || reported.has(lookaround.start)) return;
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
      if (within.some((g) => isLookahead(g) || isLookbehind(g))) {
        hits.push({ start: tok.index, length: 2, label: "`\\s` (matches `\\n`) inside a lookaround" });
      }
      continue;
    }
    if (isLineBreakEscape(tok.text)) {
      const next = tokens[i + 1];
      const pair = tok.text === "\\r" && next?.text === "\\n" && next.index === tok.index + 2;
      const end = tok.index + (pair ? 4 : 2);
      if (pair) i++;
      lineBreak(tok.index, end, `\`${source.slice(tok.index, end)}\``, within);
      continue;
    }
    if (tok.text === "[") {
      let close = i + 1;
      while (close < tokens.length && !(tokens[close]!.text === "]" && tokens[close]!.inCharClass)) close++;
      const closeToken = tokens[close];
      if (!closeToken) continue;
      const body = tokens.slice(i + 1, close);
      const end = closeToken.index + 1;
      const namesLineBreak = body.some((t) => isLineBreakEscape(t.text));
      const holdsSpace = body.some((t) => t.text === "\\s");
      const behind = within.filter(isLookbehind).sort((a, b) => b.start - a.start)[0];
      const repeatedBehind =
        behind !== undefined &&
        (repeats(source, end) || within.some((g) => g.start > behind.start && repeats(source, g.end + 1)));
      if (body[0]?.text !== "^" && (namesLineBreak || (holdsSpace && (!behind || repeatedBehind)))) {
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
    const findings: Finding[] = [];
    for (const site of index.patternSites) {
      if (site.owner.kind === "variable") continue;
      const expanded = expand(site.source, index);
      for (const hit of findHits(expanded.text)) {
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

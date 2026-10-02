// Rule: a `Scoped` rule (one with `begin:` and `end:`) commits once its
// `begin:` matches, so its `end:` must also close at a line end or at the
// next beat. Otherwise a forgotten closer lets the rule run on to the end
// of the document (GRAMMAR.md §3.1, §18). So the `end:` pattern, with its
// variables substituted, must be able to match with no closer present: at
// the end of a line, at the start of the next beat (`{{BEAT}}`), or at the
// start of the next unindented line (§11.1's indentation-block end
// `(?=^(?!$|//|\1{{WS}}))`).
//
// The check is behavioural. It resolves the variables (`{{BEAT}}` to its
// real definition) and runs the whole pattern, exactly as the engine
// would, as a sticky regex at probe positions. The end has a bail-out
// when either holds:
//
// - Line boundary: at one kind of boundary (a line end as `\n`, `\r\n`,
//   `\r` or the end of the input, or the start of an unindented line), the
//   pattern matches whatever text surrounds it: with every filler in
//   FILLERS. So a closer class such as `[^\w\s]` that happens to match
//   one filler is not a bail-out, while `(?<=\w)$|(?<=\W)$` is.
// - Beat: the pattern matches at the start of every beat line the
//   grammar's own BEAT recognises. The witness lines are generated from
//   each beat keyword (FLOW_BEAT_KEYWORDS, or `scene` and `branch`) with
//   several indentations and payloads (`░`, an identifier, a colon,
//   nothing), and BEAT itself decides which are beats. So a closer that
//   matches one sample, `(scene)` or `((?:scene|branch)[ ]+\W)`, fails on
//   another, an end that misses indented beats (`(?=\b{{BEAT}})`) fails on
//   those, and a BEAT that demands an identifier still has witnesses.
//   Shared lookaheads, prefixes and named groups around BEAT need no
//   special handling, since the whole pattern runs. When BEAT recognises
//   none of the generated lines, the check cannot build a witness, so it
//   falls back to the textual test: a `{{BEAT}}` outside every negative
//   lookaround counts.
//
// A back-reference stands for a `begin:`
// capture this check cannot see, so it is replaced by a sentinel no probe
// holds: `(\1)` needs its delimiter, while `(?!\1{{WS}})` still holds
// where the line does not repeat it. A pattern that does not compile as a
// JavaScript regex falls back to a textual check: a `$` or `{{BEAT}}`
// outside a character class and outside a negative lookaround, or a `^`
// followed by a negative lookahead, counts.

import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { findPair, isScalar, isSequence } from "../utils/yaml-ast.ts";
import { getGrammarIndex, type GrammarIndex } from "../utils/grammar-index.ts";
import { regexGroups, scanRegex } from "../utils/regex-scan.ts";

const TOKEN = /\{\{([A-Za-z0-9_]+)\}\}/g;

const BACKREFERENCE_SENTINEL = "(?:▓)";

// Line text around a probed boundary: a word character, a digit and a
// symbol no closer in the grammar uses.
const FILLERS = ["a", "7", "░"];

// Line boundaries, as text built from a filler and the probed offset: the
// end of a line in each newline form, the end of the input, and the start
// of an unindented line.
const LINE_PROBES: ((f: string) => [text: string, at: number])[] = [
  (f) => [`${f}${f}\n${f}`, 2],
  (f) => [`${f}${f}\r\n${f}`, 2],
  (f) => [`${f}${f}\r${f}`, 2],
  (f) => [`${f}${f}`, 2],
  (f) => [`${f}\n${f}`, 2],
  (f) => [`${f}\r\n${f}`, 3],
];

// Beat keywords tried when the grammar names none in FLOW_BEAT_KEYWORDS.
const DEFAULT_BEAT_KEYWORDS = ["scene", "branch"];

// Candidate beat lines for `keyword`, each probed at offset 2 (the start
// of the line after `░\n`).
const BEAT_INDENTS = ["", "  ", "\t"];
const BEAT_PAYLOADS = [" ░", " next", " Next_2", ":", " :", ""];
const beatCandidates = (keyword: string): string[] =>
  BEAT_INDENTS.flatMap((indent) =>
    BEAT_PAYLOADS.map((payload) => `░\n${indent}${keyword}${payload}\n`),
  );

function matchesAt(regex: RegExp, text: string, at: number): boolean {
  regex.lastIndex = at;
  return regex.test(text);
}

// Replaces back-references with a sentinel no probe holds. Escapes are
// walked pairwise so an escaped backslash before a digit is left alone.
function withoutBackreferences(source: string): string {
  return source.replace(/\\(?:[1-9]|k<[^>]*>|[^])/g, (escape) =>
    /^\\(?:[1-9]|k<)/.test(escape) ? BACKREFERENCE_SENTINEL : escape,
  );
}

// The candidate beat lines the grammar's BEAT matches at their start.
// Null when the grammar has no BEAT, BEAT does not compile, or it
// recognises none of the candidates: then no witness exists.
const beatLinesCache = new WeakMap<GrammarIndex, string[] | null>();
function beatLines(index: GrammarIndex): string[] | null {
  if (beatLinesCache.has(index)) return beatLinesCache.get(index)!;
  let lines: string[] = [];
  if (index.variables.has("BEAT")) {
    const declared = index.variables.get("FLOW_BEAT_KEYWORDS")?.value ?? null;
    const keywords = isSequence(declared)
      ? declared.entries.flatMap((e) =>
          isScalar(e) && typeof e.value === "string" ? [e.value] : [],
        )
      : [];
    try {
      const beat = new RegExp(
        withoutBackreferences(resolveVariables(index, "{{BEAT}}", false)),
        "muy",
      );
      lines = [...new Set([...keywords, ...DEFAULT_BEAT_KEYWORDS])]
        .flatMap(beatCandidates)
        .filter((line) => matchesAt(beat, line, 2));
    } catch {
      lines = [];
    }
  }
  const result = lines.length > 0 ? lines : null;
  beatLinesCache.set(index, result);
  return result;
}

function atLineBoundary(regex: RegExp): boolean {
  return LINE_PROBES.some((probe) =>
    FILLERS.every((filler) => matchesAt(regex, ...probe(filler))),
  );
}

// Substitutes variables (all of them, or all but `BEAT`, which then stays
// as a literal token). Undefined names and cycles stay as tokens.
function resolveVariables(
  index: GrammarIndex,
  source: string,
  keepBeat: boolean,
  seen: Set<string> = new Set(),
): string {
  return source.replace(TOKEN, (whole, name: string) => {
    if ((keepBeat && name === "BEAT") || seen.has(name)) return whole;
    const value = index.variables.get(name)?.value ?? null;
    let raw: string | null = null;
    if (isScalar(value) && typeof value.value === "string") raw = value.value;
    else if (isSequence(value)) {
      raw = `\\b(?:${value.entries
        .map((e) => (isScalar(e) && e.value !== null ? String(e.value) : ""))
        .join("|")})\\b`;
    }
    if (raw === null) return whole;
    return resolveVariables(index, raw, keepBeat, new Set([...seen, name]));
  });
}

export function hasBailOut(index: GrammarIndex, end: string): boolean {
  let regex: RegExp;
  try {
    regex = new RegExp(
      withoutBackreferences(resolveVariables(index, end, false)),
      "muy",
    );
  } catch {
    return hasTextualBailOut(index, end);
  }
  if (atLineBoundary(regex)) return true;
  const beats = beatLines(index);
  if (beats === null) {
    return namesPositiveBeat(resolveVariables(index, end, true));
  }
  return beats.every((line) => matchesAt(regex, line, 2));
}

// Whether the offset sits outside every negative lookaround of `source`.
function positiveAt(source: string): (at: number) => boolean {
  const negated = regexGroups(source).filter(
    (g) => g.kind === "negative-lookahead" || g.kind === "negative-lookbehind",
  );
  return (at) => !negated.some((g) => g.start < at && at < g.end);
}

// Whether `source` (variables resolved except `BEAT`) names `{{BEAT}}`
// outside a character class and every negative lookaround.
function namesPositiveBeat(source: string): boolean {
  const positive = positiveAt(source);
  for (const tok of scanRegex(source)) {
    if (tok.inCharClass) continue;
    if (tok.text === "{" && source.startsWith("{{BEAT}}", tok.index) && positive(tok.index)) {
      return true;
    }
  }
  return false;
}

function hasTextualBailOut(index: GrammarIndex, end: string): boolean {
  const resolved = resolveVariables(index, end, true);
  if (namesPositiveBeat(resolved)) return true;
  // A boundary inside a negative lookaround asserts its absence, as in
  // `(?!$)`, so it is no bail-out.
  const positive = positiveAt(resolved);
  for (const tok of scanRegex(resolved)) {
    if (tok.inCharClass) continue;
    if (tok.text === "$" && positive(tok.index)) return true;
    // §11.1's indentation block, `(?=^(?!$|//|\1{{WS}}))`, closes at the
    // start of every line but the ones it excludes, which bounds it as a
    // line end would.
    if (tok.text === "^" && resolved.startsWith("(?!", tok.index + 1) && positive(tok.index)) {
      return true;
    }
  }
  return false;
}

const { rule, find } = defineBaselinedRule(
  {
    type: "problem",
    docs: {
      description:
        "Require a `{{BEAT}}` or `$` bail-out in every `begin`/`end` rule's `end:` pattern.",
    },
    messages: {
      noBailOut: `\`end:\` of {{name}} matches only after its closer, with no \`{{BEAT}}\` or line-end alternative, so a missing closer lets the rule run on to the end of the document. Add \`(?={{BEAT}})|\` or a \`$\` alternative. See GRAMMAR.md §3.1, §18.${BASELINE_NOTE}`,
    },
  },
  (context) => {
    const index = getGrammarIndex(context);
    const findings: Finding[] = [];
    for (const { owner, mapping } of index.ruleMappings) {
      const begin = findPair(mapping, "begin");
      const end = findPair(mapping, "end");
      if (!begin || !end) continue;
      if (!isScalar(end.value) || typeof end.value.value !== "string") continue;
      if (hasBailOut(index, end.value.value)) continue;
      const inline = owner.pair?.value !== mapping;
      findings.push({
        owner: owner.id,
        loc: end.value.loc,
        messageId: "noBailOut",
        data: { name: `${owner.name}${inline ? " (inline rule)" : ""}` },
      });
    }
    return findings;
  },
);

export { find };
export default rule;

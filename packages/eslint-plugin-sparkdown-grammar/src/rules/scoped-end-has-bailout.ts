import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { findPair, isScalar, isSequence } from "../utils/yaml-ast.ts";
import { getGrammarIndex, type GrammarIndex } from "../utils/grammar-index.ts";
import { regexGroups, scanRegex } from "../utils/regex-scan.ts";

const TOKEN = /\{\{([A-Za-z0-9_]+)\}\}/g;

const BACKREFERENCE_SENTINEL = "(?:▓)";

const FILLERS = ["a", "7", "░"];

const LINE_PROBES: ((f: string) => [text: string, at: number])[] = [
  (f) => [`${f}${f}\n${f}`, 2],
  (f) => [`${f}${f}\r\n${f}`, 2],
  (f) => [`${f}${f}\r${f}`, 2],
  (f) => [`${f}${f}`, 2],
  (f) => [`${f}\n${f}`, 2],
  (f) => [`${f}\r\n${f}`, 3],
];

const DEFAULT_BEAT_KEYWORDS = ["scene", "branch"];

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

export function withoutBackreferences(source: string): string {
  return source.replace(/\\(?:[1-9]|k<[^>]*>|[^])/g, (escape) =>
    /^\\(?:[1-9]|k<)/.test(escape) ? BACKREFERENCE_SENTINEL : escape,
  );
}

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

export function resolveVariables(
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

function positiveAt(source: string): (at: number) => boolean {
  const negated = regexGroups(source).filter(
    (g) => g.kind === "negative-lookahead" || g.kind === "negative-lookbehind",
  );
  return (at) => !negated.some((g) => g.start < at && at < g.end);
}

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
  const positive = positiveAt(resolved);
  for (const tok of scanRegex(resolved)) {
    if (tok.inCharClass) continue;
    if (tok.text === "$" && positive(tok.index)) return true;
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

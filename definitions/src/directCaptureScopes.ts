import {
  isLookaround,
  type RegexGroup,
  regexGroups,
  splitTopLevelAlternation,
} from "../../packages/eslint-plugin-sparkdown-grammar/src/utils/regex-scan";

type Capture ={ name?: string; contentName?: string; patterns?: { include?: string }[] };
type Captures = Record<string, Capture>;
type Rule = Record<string, unknown>;

const WHITESPACE = "(?:[^\\S\\n\\r])";
const NAME_END = "(?![a-zA-Z0-9_]|(?:@[a-zA-Z0-9_]))";
const SPACE_OR_TAB_ONLY = /^(?:\(\?:|\)|\||\$|[*+]|\(\?:\[\^\\S\\n\\r\]\)|\(\?:\[ \\t\]\)|\[ \\t\])+$/;
const LINE_BREAK_CAPABLE = /\\[nrsWDHPv]|\[\^(?!\\S\\n\\r\])|\\x0[aAdD]|\\u000[aAdD]/;
const SEES_LINE_END = /\$|\\[zZ]|\(\?=/;
const WORD = /^[A-Za-z]+$/;

const capturingGroupsOf = (re: string): RegexGroup[] =>
  regexGroups(re)
    .filter((g) => g.kind === "capture" || g.kind === "named")
    .sort((a, b) => a.start - b.start);

export const capturingGroups = (re: string): (string | undefined)[] => [
  undefined,
  ...capturingGroupsOf(re).map((g) => g.text),
];

const isWholeGroup = (re: string) => regexGroups(re).some((g) => g.start === 0 && g.end === re.length - 1);

const withoutGroups = (re: string, drop: (group: RegexGroup) => boolean) => {
  let out = "";
  let from = 0;
  for (const group of regexGroups(re)
    .filter(drop)
    .sort((a, b) => a.start - b.start)) {
    if (group.start < from) continue;
    out += re.slice(from, group.start);
    from = group.end + 1;
  }
  return out + re.slice(from);
};

const LITERAL_CLASS_MEMBER = /\\([^A-Za-z0-9])|([^\\\]^-])/g;

const singleCharacters = (body: string): Set<string> | undefined => {
  const unwrapped = body.startsWith("(?:") && isWholeGroup(body) ? body.slice(3, -1) : body;
  const chars = new Set<string>();
  for (const { text: alternative } of splitTopLevelAlternation(unwrapped)) {
    const escaped = /^\\([^A-Za-z0-9])$/.exec(alternative);
    if (escaped) {
      chars.add(escaped[1]!);
      continue;
    }
    const cls = /^\[((?:\\[^A-Za-z0-9]|[^\\\]^-])+)\]$/.exec(alternative);
    if (!cls) return undefined;
    for (const member of cls[1]!.matchAll(LITERAL_CLASS_MEMBER)) chars.add(member[1] ?? member[2]!);
  }
  return chars;
};

const BLIND_TO_LINE_END = new Set(["negative-lookahead", "lookbehind", "negative-lookbehind"]);

const withoutLookarounds = (re: string, truncated = true) => {
  const seesLineEnd = regexGroups(re).some(
    (g) => g.kind === "negative-lookahead" && SEES_LINE_END.test(g.body),
  );
  if (truncated && seesLineEnd) return undefined;
  return withoutGroups(re, (g) => BLIND_TO_LINE_END.has(g.kind));
};

const withoutZeroWidth = (re: string) => withoutGroups(re, (g) => isLookaround(g.kind));

const coversWholeCapture = (group: string, leafMatch: string) => {
  const groupBody = group.slice(1, -1);
  if (leafMatch === `(${WHITESPACE}*)` || leafMatch === `(${WHITESPACE}+)`) {
    return SPACE_OR_TAB_ONLY.test(withoutZeroWidth(groupBody));
  }
  if (leafMatch === "(.+)" || leafMatch === "(.*)") {
    return !LINE_BREAK_CAPABLE.test(group);
  }
  const keyword = leafMatch.endsWith(NAME_END) ? leafMatch.slice(0, -NAME_END.length) : leafMatch;
  if (!keyword.startsWith("(") || !isWholeGroup(keyword)) return false;
  const leafBody = keyword.slice(1, -1);
  if (WORD.test(leafBody)) {
    const core = withoutLookarounds(groupBody, false) ?? "";
    return core === leafBody || core === `(?:${leafBody})`;
  }
  const leafChars = singleCharacters(leafBody);
  if (leafChars) {
    const groupChars = singleCharacters(withoutLookarounds(groupBody, false) ?? "");
    return !!groupChars && [...groupChars].every((c) => leafChars.has(c));
  }
  if (group !== leafMatch) return false;
  const rest = withoutLookarounds(leafBody);
  return rest !== undefined && !/[|$]|\\[GzZA]|[*+?]\?|\(\?=/.test(rest);
};

const directScope = (group: string | undefined, capture: Capture, repository: Record<string, Rule>) => {
  if (group === undefined || capture.contentName || capture.patterns?.length !== 1) return undefined;
  const include = capture.patterns[0]?.include;
  if (!include?.startsWith("#")) return undefined;
  const leaf = repository[include.slice(1)];
  if (!leaf || typeof leaf["match"] !== "string" || typeof leaf["name"] !== "string") return undefined;
  if (leaf["captures"] || leaf["patterns"] || leaf["begin"] || leaf["name"].includes("$")) return undefined;
  if (capture.name?.includes("$")) return undefined;
  if (!coversWholeCapture(group, leaf["match"])) return undefined;
  return capture.name ? `${capture.name} ${leaf["name"]}` : leaf["name"];
};

const CAPTURE_SOURCES: [string, string[]][] = [
  ["captures", ["match", "begin", "end", "while"]],
  ["beginCaptures", ["begin"]],
  ["endCaptures", ["end"]],
  ["whileCaptures", ["while"]],
];

const rewriteRule = (rule: Rule, repository: Record<string, Rule>) => {
  for (const [key, fields] of CAPTURE_SOURCES) {
    const captures = rule[key] as Captures | undefined;
    if (!captures || typeof captures !== "object") continue;
    const sources = fields.filter((field) => {
      if (typeof rule[field] !== "string") return false;
      if (key !== "captures" || field === "match") return true;
      return !rule[`${field}Captures`];
    });
    if (sources.length === 0) continue;
    const groups = sources.map((field) => capturingGroups(rule[field] as string));
    for (const [index, capture] of Object.entries(captures)) {
      const scopes = groups.map((g) => directScope(g[Number(index)], capture, repository));
      const scope = scopes[0];
      if (scope && scopes.every((s) => s === scope)) captures[index] = { name: scope };
    }
  }
  for (const value of Object.values(rule)) {
    if (value && typeof value === "object") rewriteRule(value as Rule, repository);
  }
};

const NAME_BODY = `(?:[a-zA-Z_][a-zA-Z0-9_]*(?:@[a-zA-Z0-9_]+)*${NAME_END})`;

const groupStart = (re: string, index: number) => capturingGroupsOf(re)[index - 1]?.start ?? -1;

const nonCapturing = (re: string) => {
  let out = "";
  let from = 0;
  for (const group of capturingGroupsOf(re)) {
    const opener = group.kind === "named" ? re.indexOf(">", group.start) + 1 : group.start + 1;
    out += `${re.slice(from, group.start)}(?:`;
    from = opener;
  }
  return out + re.slice(from);
};

const wordLeaf = (repository: Record<string, Rule>, include: string | undefined) => {
  if (!include?.startsWith("#")) return undefined;
  const leaf = repository[include.slice(1)];
  if (!leaf || typeof leaf["match"] !== "string" || typeof leaf["name"] !== "string") return undefined;
  if (leaf["captures"] || leaf["patterns"] || leaf["begin"] || leaf["name"].includes("$")) return undefined;
  return leaf as { match: string; name: string };
};

const joinScopes = (outer: string | undefined, inner: string) => (outer ? `${outer} ${inner}` : inner);

const splitByWordRule = (rule: Rule, repository: Record<string, Rule>): Rule | undefined => {
  const field = typeof rule["match"] === "string" ? "match" : typeof rule["begin"] === "string" ? "begin" : undefined;
  if (!field) return undefined;
  const key = field === "match" ? "captures" : "beginCaptures";
  const captures = rule[key] as Captures | undefined;
  if (!captures) return undefined;
  const classifying = Object.entries(captures).filter(([, c]) => (c.patterns?.length ?? 0) > 1);
  if (classifying.length !== 1) return undefined;
  const [index, capture] = classifying[0]!;
  if (capture.contentName || capture.name?.includes("$")) return undefined;
  const leaves = capture.patterns!.map((p) => wordLeaf(repository, p.include));
  if (leaves.some((leaf) => !leaf)) return undefined;
  const words = leaves as { match: string; name: string }[];
  const re = rule[field] as string;
  const group = capturingGroups(re)[Number(index)];
  const last = words[words.length - 1]!;
  if (!group || last.match !== group || !group.includes(NAME_BODY)) return undefined;
  const earlier = words.slice(0, -1);
  if (!earlier.every((w) => w.match.endsWith(NAME_END) || w.match.endsWith(`${NAME_END})`))) return undefined;
  const at = groupStart(re, Number(index));
  return {
    patterns: words.map((word, i) => {
      const copy = structuredClone(rule);
      if (i < words.length - 1) {
        copy[field] = `${re.slice(0, at + 1)}(?=${nonCapturing(word.match)})${re.slice(at + 1)}`;
      }
      (copy[key] as Captures)[index] = { name: joinScopes(capture.name, word.name) };
      return copy;
    }),
  };
};

export const withDirectCaptureScopes = <T extends { repository: object }>(grammar: T): T => {
  const copy = structuredClone(grammar);
  const repository = copy.repository as Record<string, Rule>;
  const original = grammar.repository as Record<string, Rule>;
  for (const [name, rule] of Object.entries(repository)) {
    const split = splitByWordRule(rule, original);
    if (split) repository[name] = split;
  }
  for (const rule of Object.values(repository)) rewriteRule(rule, original);
  return copy;
};

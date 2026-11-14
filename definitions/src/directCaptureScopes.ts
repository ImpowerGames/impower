type Capture = { name?: string; contentName?: string; patterns?: { include?: string }[] };
type Captures = Record<string, Capture>;
type Rule = Record<string, unknown>;

const WHITESPACE = "(?:[^\\S\\n\\r])";
const NAME_END = "(?![a-zA-Z0-9_]|(?:@[a-zA-Z0-9_]))";
const SPACE_OR_TAB_ONLY = /^(?:\(\?:|\)|\||\$|[*+]|\(\?:\[\^\\S\\n\\r\]\)|\(\?:\[ \\t\]\)|\[ \\t\])+$/;
const LINE_BREAK_CAPABLE = /\\[nrsWDHPv]|\[\^(?!\\S\\n\\r\])|\\x0[aAdD]|\\u000[aAdD]/;
const BLIND_TO_LINE_END = /^\(\?(?:<[!=]|!)/;
const SEES_LINE_END = /\$|\\[zZ]|\(\?=/;
const WORD = /^[A-Za-z]+$/;

const skipClass = (re: string, at: number) => {
  let j = at + 1;
  if (re[j] === "^") j++;
  if (re[j] === "]") j++;
  for (; j < re.length && re[j] !== "]"; j++) {
    if (re[j] === "\\") j++;
  }
  return j;
};

const closingParen = (re: string, at: number) => {
  let depth = 0;
  for (let j = at; j < re.length; j++) {
    const c = re[j];
    if (c === "\\") {
      j++;
    } else if (c === "[") {
      j = skipClass(re, j);
    } else if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return re.length;
};

const opensCapture = (re: string, at: number) =>
  re[at + 1] !== "?" || (re[at + 2] === "<" && re[at + 3] !== "=" && re[at + 3] !== "!");

export const capturingGroups =(re: string): (string | undefined)[] => {
  const groups: (string | undefined)[] = [undefined];
  const open: { at: number; index: number }[] = [];
  for (let j = 0; j < re.length; j++) {
    const c = re[j];
    if (c === "\\") {
      j++;
    } else if (c === "[") {
      j = skipClass(re, j);
    } else if (c === "(") {
      const capturing = opensCapture(re, j);
      open.push({ at: j, index: capturing ? groups.length : -1 });
      if (capturing) groups.push(undefined);
    } else if (c === ")") {
      const group = open.pop();
      if (group && group.index > 0) groups[group.index] = re.slice(group.at, j + 1);
    }
  }
  return groups;
};

const LITERAL_CLASS_MEMBER = /\\([^A-Za-z0-9])|([^\\\]^-])/g;

const topLevelAlternatives = (re: string) => {
  const alternatives: string[] = [];
  let depth = 0;
  let from = 0;
  for (let j = 0; j < re.length; j++) {
    const c = re[j];
    if (c === "\\") {
      j++;
    } else if (c === "[") {
      j = skipClass(re, j);
    } else if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth--;
    } else if (c === "|" && depth === 0) {
      alternatives.push(re.slice(from, j));
      from = j + 1;
    }
  }
  alternatives.push(re.slice(from));
  return alternatives;
};

const singleCharacters = (body: string): Set<string> | undefined => {
  const unwrapped = body.startsWith("(?:") && closingParen(body, 0) === body.length - 1 ? body.slice(3, -1) : body;
  const chars = new Set<string>();
  for (const alternative of topLevelAlternatives(unwrapped)) {
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

const withoutLookarounds = (re: string, truncated = true) => {
  let out = "";
  for (let j = 0; j < re.length; j++) {
    if (re[j] === "(" && BLIND_TO_LINE_END.test(re.slice(j, j + 4))) {
      const end = closingParen(re, j);
      const lookahead = re[j + 2] === "!";
      if (truncated && lookahead && SEES_LINE_END.test(re.slice(j + 3, end))) return undefined;
      j = end;
      continue;
    }
    out += re[j];
    if (re[j] === "\\") out += re[++j] ?? "";
  }
  return out;
};

const withoutZeroWidth = (re: string) => {
  let out = "";
  for (let j = 0; j < re.length; j++) {
    if (re[j] === "(" && /^\(\?(?:<?[!=])/.test(re.slice(j, j + 4))) {
      j = closingParen(re, j);
      continue;
    }
    out += re[j];
    if (re[j] === "\\") out += re[++j] ?? "";
  }
  return out;
};

const coversWholeCapture = (group: string, leafMatch: string) => {
  const groupBody = group.slice(1, -1);
  if (leafMatch === `(${WHITESPACE}*)` || leafMatch === `(${WHITESPACE}+)`) {
    return SPACE_OR_TAB_ONLY.test(withoutZeroWidth(groupBody));
  }
  if (leafMatch === "(.+)" || leafMatch === "(.*)") {
    return !LINE_BREAK_CAPABLE.test(group);
  }
  const keyword = leafMatch.endsWith(NAME_END) ? leafMatch.slice(0, -NAME_END.length) : leafMatch;
  if (!keyword.startsWith("(") || closingParen(keyword, 0) !== keyword.length - 1) return false;
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

const groupStart = (re: string, index: number) => {
  let seen = 0;
  for (let j = 0; j < re.length; j++) {
    const c = re[j];
    if (c === "\\") {
      j++;
    } else if (c === "[") {
      j = skipClass(re, j);
    } else if (c === "(" && opensCapture(re, j)) {
      seen++;
      if (seen === index) return j;
    }
  }
  return -1;
};

const nonCapturing = (re: string) => {
  let out = "";
  for (let j = 0; j < re.length; j++) {
    const c = re[j]!;
    if (c === "\\") {
      out += c + (re[j + 1] ?? "");
      j++;
    } else if (c === "[") {
      const end = skipClass(re, j);
      out += re.slice(j, end + 1);
      j = end;
    } else {
      if (c === "(" && opensCapture(re, j)) {
        out += "(?:";
        if (re[j + 1] === "?") j = re.indexOf(">", j);
      } else {
        out += c;
      }
    }
  }
  return out;
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

import { pathToFileURL } from "node:url";
import { readRepos, ticketsRepo } from "../repos.mjs";

let repos = null;
let defaultRepos = null;

function recipe() {
  return `gh api -X POST repos/${ticketsRepo(repos)}/issues -f title="<title>" -F body=@ticket.md -f type=Bug -f "labels[]=<label>"   # type is Bug, Feature, or Task; repeat labels[] per label`;
}

const GH_API_VALUE_FLAGS = new Set(["-H", "--header", "-p", "--preview", "-q", "--jq", "-t", "--template", "--cache", "--hostname"]);
const GH_API_FIELD_FLAGS = new Set(["-f", "--raw-field", "-F", "--field"]);
const GH_ISSUE_CREATE_VALUE_FLAGS = new Set([
  "-t", "--title", "-b", "--body", "-F", "--body-file", "-l", "--label", "-a", "--assignee",
  "-m", "--milestone", "-p", "--project", "-T", "--template", "-R", "--repo", "--recover",
]);

const WRAPPERS = new Map([
  ["sudo", { flags: new Set(["-u", "-g", "-p", "-h", "-C", "-D", "-r", "-t", "-T", "-U", "--user", "--group", "--host", "--prompt", "--chdir"]) }],
  ["doas", { flags: new Set(["-u", "-C"]) }],
  ["env", { flags: new Set(["-u", "-C", "-S", "--unset", "--chdir", "--split-string"]) }],
  ["xargs", { flags: new Set(["-I", "-i", "-n", "-P", "-L", "-l", "-d", "-a", "-s", "-E", "-e", "--max-args", "--max-procs", "--max-lines", "--delimiter", "--replace", "--arg-file", "--max-chars", "--eof"]) }],
  ["time", { flags: new Set(["-f", "-o", "--format", "--output"]) }],
  ["timeout", { flags: new Set(["-s", "-k", "--signal", "--kill-after"]), positional: 1 }],
  ["nice", { flags: new Set(["-n", "--adjustment"]) }],
  ["stdbuf", { flags: new Set(["-o", "-e", "-i", "--output", "--error", "--input"]) }],
  ["npx", { flags: new Set(["-p", "--package", "-c", "--call"]) }],
  ["nohup", { flags: new Set() }],
  ["command", { flags: new Set() }],
  ["builtin", { flags: new Set() }],
  ["exec", { flags: new Set(["-a"]) }],
  ["winpty", { flags: new Set() }],
]);
const KEYWORDS = new Set(["do", "then", "else", "elif", "if", "while", "until", "!", "%", "foreach-object"]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "ash", "busybox", "pwsh", "powershell", "cmd"]);
const REDIRECT_DUP = /^\d*[<>]{1,2}&[\d-]+$/;
const REDIRECT_OP = /^(\d*[<>]{1,2}|&>>?|>&)$/;
const REDIRECT_GLUED = /^(\d*[<>]{1,2}&?|&>>?)[^<>&]/;
const PS_ASSIGN = /^\$([A-Za-z_][A-Za-z0-9_:]*|\{[^}]+\})([+-]?=(.*))?$/;

function tokenize(command) {
  const tokens = [];
  tokens.subs = [];
  let text = "";
  let quoted = false;
  let started = false;
  let start = 0;
  let arith = 0;
  let noEscapedCloseFrom = command.length;
  const heredocs = [];
  const flush = (end) => {
    if (started) tokens.push({ text, quoted, start, end });
    text = "";
    quoted = false;
    started = false;
  };
  const sep = (end) => {
    flush(end);
    tokens.push({ sep: true });
  };
  const begin = (at) => {
    if (!started) start = at;
    started = true;
  };
  const lastIsFlag = () => {
    const last = tokens[tokens.length - 1];
    return Boolean(last && !last.sep && !last.quoted && /^-[A-Za-z]/.test(last.text));
  };
  let i = 0;
  const n = command.length;
  while (i < n) {
    const c = command[i];
    if (c === "@" && (command[i + 1] === '"' || command[i + 1] === "'") && !started && /^\r?\n/.test(command.slice(i + 2, i + 4))) {
      const q = command[i + 1];
      const close = command.indexOf(`\n${q}@`, i + 2);
      const end = close < 0 ? n : close + 3;
      tokens.push({ text: command.slice(i + 2, close < 0 ? n : close).replace(/^\r?\n/, ""), quoted: true, start: i, end });
      i = end;
      continue;
    }
    if (c === "'") {
      begin(i);
      quoted = true;
      i++;
      while (i < n) {
        if (command[i] === "'") {
          if (command[i + 1] === "'") {
            text += "'";
            i += 2;
            continue;
          }
          break;
        }
        text += command[i++];
      }
      i++;
      continue;
    }
    if (c === '"') {
      begin(i);
      quoted = true;
      const backslashEscapes = currentShell !== "powershell" && i < noEscapedCloseFrom && scanQuote(command, i, true) >= 0;
      if (!backslashEscapes) noEscapedCloseFrom = Math.min(noEscapedCloseFrom, i);
      i++;
      while (i < n && command[i] !== '"') {
        if (backslashEscapes && command[i] === "\\" && i + 1 < n && '"\\$`\n'.includes(command[i + 1])) {
          i++;
          if (command[i] !== "\n") text += command[i];
          i++;
          continue;
        }
        if (command[i] === "$" && command[i + 1] === "(") {
          const close = matchParen(command, i + 1);
          tokens.subs.push(command.slice(i + 2, close));
          text += command.slice(i, close + 1);
          i = close + 1;
          continue;
        }
        if (command[i] === "`") {
          const next = command[i + 1] ?? "";
          const close = currentShell === "powershell" ? -1 : command.indexOf("`", i + 1);
          if (close < 0) {
            if (i + 1 < n) text += next;
            i += 2;
            continue;
          }
          tokens.subs.push(command.slice(i + 1, close));
          text += command.slice(i, close + 1);
          i = close + 1;
          continue;
        }
        text += command[i++];
      }
      i++;
      continue;
    }
    const opensGroup = c === "(" || (c === "$" && command[i + 1] === "(") || (c === "@" && (command[i + 1] === "(" || command[i + 1] === "{"));
    const flagPrefix = opensGroup && started && text.startsWith("-") && text.endsWith(":");
    if (opensGroup && ((!started && lastIsFlag()) || flagPrefix)) {
      const openAt = c === "(" ? i : i + 1;
      const close = matchBracket(command, openAt);
      if (close < n) {
        tokens.subs.push(command.slice(openAt + 1, close));
        if (flagPrefix) {
          text += command.slice(i, close + 1);
          quoted = true;
        } else {
          tokens.push({ text: command.slice(i, close + 1), quoted: true, group: true, start: i, end: close + 1 });
        }
        i = close + 1;
        continue;
      }
    }
    if (c === "\\" && currentShell !== "powershell") {
      if (i + 1 < n) {
        const next = command[i + 1];
        if (next === "\n") {
          i += 2;
          continue;
        }
        if (next === "\r" && command[i + 2] === "\n") {
          i += 3;
          continue;
        }
        begin(i);
        text += '"\'\\ $`'.includes(next) ? next : c + next;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (c === "`") {
      if (command[i + 1] === "\n") {
        i += 2;
        continue;
      }
      if (command[i + 1] === "\r" && command[i + 2] === "\n") {
        i += 3;
        continue;
      }
      if (started && !text.includes("=") && i + 1 < n && !" \t".includes(command[i + 1])) {
        text += command[i + 1];
        i += 2;
        continue;
      }
      sep(i);
      i++;
      continue;
    }
    if (c === "#" && !started) {
      while (i < n && command[i] !== "\n") i++;
      continue;
    }
    if (c === "<" && command[i + 1] === "<" && command[i + 2] === "<") {
      flush(i);
      tokens.push({ text: "<<<", quoted: false, start: i, end: i + 3 });
      i += 3;
      continue;
    }
    if (c === "<" && command[i + 1] === "<" && arith === 0) {
      flush(i);
      const doc = readHeredocOperator(command, i);
      if (doc) {
        heredocs.push(doc);
        i = doc.next;
      } else {
        i += 2;
      }
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      flush(i);
      i++;
      continue;
    }
    if (c === "\n") {
      sep(i);
      i++;
      arith = 0;
      i = skipHeredocBodies(command, i, heredocs);
      continue;
    }
    if (c === "(" && command[i + 1] === "(") {
      arith++;
      sep(i);
      i += 2;
      continue;
    }
    if (c === ")" && command[i + 1] === ")" && arith > 0) {
      arith--;
      sep(i);
      i += 2;
      continue;
    }
    if (c === "&" && started && /[<>]$/.test(text)) {
      text += c;
      i++;
      continue;
    }
    if (c === "&" && !started && command[i + 1] === ">") {
      begin(i);
      text += "&>";
      i += 2;
      continue;
    }
    if (c === ";" || c === "|" || c === "&" || c === "(" || c === ")") {
      sep(i);
      i++;
      continue;
    }
    if ((c === "{" || c === "}") && !started) {
      sep(i);
      i++;
      continue;
    }
    if (c === "$" && command[i + 1] === "(") {
      sep(i);
      i += 2;
      if (command[i] === "(") {
        arith++;
        i++;
      }
      continue;
    }
    begin(i);
    text += c;
    i++;
  }
  flush(n);
  return tokens;
}

function matchParen(command, open) {
  return matchBracket(command, open);
}

function readHeredocOperator(command, i) {
  const n = command.length;
  let j = i + 2;
  let strip = false;
  if (command[j] === "-") {
    strip = true;
    j++;
  }
  while (j < n && " \t".includes(command[j])) j++;
  let delim = "";
  while (j < n && !" \t\r\n;|&<>()".includes(command[j])) {
    const ch = command[j++];
    if (ch === "'" || ch === '"') continue;
    if (ch === "\\" && j < n) {
      delim += command[j++];
      continue;
    }
    delim += ch;
  }
  if (!delim || /^\d+$/.test(delim)) return null;
  return { delim, strip, next: j };
}

function skipHeredocBodies(command, i, heredocs) {
  const n = command.length;
  while (heredocs.length && i < n) {
    const { delim, strip } = heredocs.shift();
    while (i < n) {
      let end = command.indexOf("\n", i);
      if (end < 0) end = n;
      let line = command.slice(i, end).replace(/\r$/, "");
      if (strip) line = line.replace(/^\t+/, "");
      i = Math.min(end + 1, n);
      if (line === delim) break;
    }
  }
  heredocs.length = 0;
  return i;
}

function matchBracket(command, open) {
  const partner = bracketPartners(command).get(open);
  return partner === undefined ? command.length : partner;
}

let partnerCacheKey = null;
let partnerCacheShell = null;
let partnerCache = null;

let currentShell = "bash";

function bracketPartners(command) {
  if (partnerCacheKey === command && partnerCacheShell === currentShell) return partnerCache;
  let result = computePartners(command, new Set());
  if (result.unclosedFlagValues.length) result = computePartners(command, new Set(result.unclosedFlagValues));
  partnerCacheKey = command;
  partnerCacheShell = currentShell;
  partnerCache = result.map;
  return result.map;
}

function computePartners(command, suppressed) {
  const map = new Map();
  const stack = [];
  const heredocs = [];
  const n = command.length;
  let inString = false;
  let backslashEscapes = true;
  let wordStart = true;
  let arith = 0;
  let noCloseFrom = n;
  const powershell = currentShell === "powershell";
  const flagValue = (at) => {
    if (!powershell || suppressed.has(at)) return false;
    let j = at - 1;
    if (command[j] === "@" || command[j] === "$") j--;
    for (;;) {
      while (j >= 0 && " \t".includes(command[j])) j--;
      if (j >= 1 && command[j] === "\n" && (command[j - 1] === "`" || (command[j - 1] === "\r" && command[j - 2] === "`"))) {
        j -= command[j - 1] === "`" ? 2 : 3;
        continue;
      }
      break;
    }
    let start = j;
    while (start >= 0 && /[\w:-]/.test(command[start])) start--;
    const word = command.slice(start + 1, j + 1);
    return /^-[A-Za-z][\w-]*:?$/.test(word);
  };
  const inFlagValue = () => stack.length > 0 && stack[stack.length - 1].psIn;
  const push = (ch, at, resumesString, ps) => {
    stack.push({ ch, at, resumesString, ps, psIn: ps || (stack.length > 0 && stack[stack.length - 1].psIn) });
  };
  for (let k = 0; k < n; k++) {
    const ch = command[k];
    if (inString) {
      if (ch === "`" || (backslashEscapes && ch === "\\")) {
        k++;
        continue;
      }
      if (ch === '"') {
        inString = false;
        continue;
      }
      if (ch === "$" && command[k + 1] === "(") {
        push("(", k + 1, true, false);
        inString = false;
        k++;
        if (command[k + 1] === "(") {
          arith++;
          push("(", k + 1, false, false);
          k++;
        }
      }
      continue;
    }
    if (ch === "\\" && !powershell) {
      k++;
      wordStart = false;
      continue;
    }
    if (ch === "'") {
      const end = scanQuote(command, k, false);
      if (end >= 0) k = end;
      wordStart = false;
      continue;
    }
    if (ch === '"') {
      if (k < noCloseFrom && scanQuote(command, k, false) >= 0) {
        backslashEscapes = !powershell && !inFlagValue() && scanQuote(command, k, true) >= 0;
        inString = true;
      } else noCloseFrom = Math.min(noCloseFrom, k);
      wordStart = false;
      continue;
    }
    if (ch === "#" && wordStart) {
      const end = command.indexOf("\n", k);
      k = end < 0 ? n : end - 1;
      continue;
    }
    if (ch === "<" && command[k + 1] === "<" && command[k + 2] !== "<" && arith === 0) {
      const doc = readHeredocOperator(command, k);
      if (doc) {
        heredocs.push(doc);
        k = doc.next - 1;
      } else k++;
      wordStart = false;
      continue;
    }
    if (ch === "\n") {
      wordStart = true;
      arith = 0;
      if (heredocs.length) k = skipHeredocBodies(command, k + 1, heredocs) - 1;
      continue;
    }
    if (ch === "(" && command[k + 1] === "(") {
      arith++;
      push(ch, k, false, flagValue(k));
      push(ch, k + 1, false, false);
      k++;
      wordStart = false;
      continue;
    }
    if (ch === ")" && command[k + 1] === ")" && arith > 0) arith--;
    if (ch === "(" || ch === "{") {
      push(ch, k, false, flagValue(k));
    } else if (ch === ")" || ch === "}") {
      const want = ch === ")" ? "(" : "{";
      let j = stack.length - 1;
      while (j >= 0 && stack[j].ch !== want) j--;
      if (j >= 0) {
        map.set(stack[j].at, k);
        if (stack[j].resumesString) inString = true;
        stack.length = j;
      }
    }
    wordStart = " \t;|&(".includes(ch);
  }
  return { map, unclosedFlagValues: stack.filter((e) => e.ps).map((e) => e.at) };
}

function scanQuote(command, open, backslashEscapes) {
  const q = command[open];
  for (let k = open + 1; k < command.length; k++) {
    const ch = command[k];
    if (q === '"' && (ch === "`" || (backslashEscapes && ch === "\\"))) {
      k++;
      continue;
    }
    if (ch === q) {
      if (q === "'" && command[k + 1] === "'") {
        k++;
        continue;
      }
      return k;
    }
  }
  return -1;
}

function baseName(token) {
  return token.text.replace(/\\/g, "/").split("/").pop().toLowerCase().replace(/\.exe$/, "");
}

function normalizeRepo(value) {
  const v = value.trim().replace(/^=/, "").replace(/\/+$/, "").replace(/\.git$/, "").toLowerCase();
  const m = v.match(/(?:^|[/:])([^/:]+\/[^/:]+)$/);
  return m ? m[1] : v;
}

function isCodeRepo(repo) {
  const r = normalizeRepo(repo);
  return r === repos.code.toLowerCase() || r === "{owner}/{repo}" || r === ":owner/:repo";
}

function isTypedRepo(repo) {
  return repos.cutover ? normalizeRepo(repo) === repos.internal.toLowerCase() : isCodeRepo(repo);
}

function flagValue(args, i) {
  const t = args[i].text;
  const eq = t.indexOf("=");
  if (t.startsWith("--") && eq > 0) return [t.slice(eq + 1), 1];
  if (!t.startsWith("--") && t.length > 2) return [t.slice(2).replace(/^=/, ""), 1];
  return [args[i + 1]?.text ?? "", 2];
}

function flagName(t) {
  if (t.startsWith("--")) return t.toLowerCase().split("=")[0];
  if (t.startsWith("-") && t.length > 1) return t.slice(0, 2);
  return null;
}

function takesNextToken(t, name) {
  return !t.includes("=") && t.length === name.length;
}

function ghInvocation(args) {
  const words = [];
  const rest = [];
  let repo = null;
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    const wantWord = words.length === 0 || (words.length === 1 && ["issue", "pr", "search", "discussion"].includes(words[0]));
    if (wantWord && t.startsWith("-")) {
      const name = flagName(t);
      if (name === "-R" || name === "--repo" || name === "--hostname") {
        const [value, used] = flagValue(args, i);
        if (name !== "--hostname") repo = value;
        i += used - 1;
        continue;
      }
      rest.push(args[i]);
      continue;
    }
    if (wantWord) words.push(t.toLowerCase());
    else rest.push(args[i]);
  }
  return { words, rest, repo };
}

function checkGhIssueCreate(args, presetRepo) {
  let repo = presetRepo;
  let typed = false;
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    const name = flagName(t);
    if (name === null) continue;
    if (name === "-R" || name === "--repo") {
      const [value, used] = flagValue(args, i);
      repo = value;
      i += used - 1;
      continue;
    }
    if (name === "--type") {
      const [value, used] = flagValue(args, i);
      const isValue = value !== "" && !value.startsWith("-");
      if (isValue) typed = true;
      if (isValue || used === 1) i += used - 1;
      continue;
    }
    if (GH_ISSUE_CREATE_VALUE_FLAGS.has(name) && takesNextToken(t, name)) i++;
  }
  if (typed || (repo !== null && !isTypedRepo(repo))) return null;
  return (
    "gh issue create without --type leaves the issue untyped, and every ticket here carries one (Bug, Feature, or Task). " +
    "Add --type Bug (or Feature, or Task), or create the issue with one typed REST call instead: " + recipe()
  );
}

const GH_VALUE_FLAGS = new Set([
  ...GH_ISSUE_CREATE_VALUE_FLAGS,
  "-A", "--author", "-B", "--base", "-H", "--head", "-r", "--reviewer", "-q", "--jq", "--json", "-S", "--search",
  "-s", "--state", "-L", "--limit",
  "--add-label", "--remove-label", "--add-assignee", "--remove-assignee", "--add-reviewer", "--remove-reviewer",
  "--add-project", "--remove-project", "--owner", "--app", "--assignee", "--mention", "--milestone", "--sort", "--order",
  "--match", "--language", "--created", "--updated", "--closed", "--merged", "--commenter", "--involves", "--reason",
  "--duplicate-of", "--subject", "--match-head-commit", "--body-file", "--template",
]);

function ghArgs(args) {
  const flags = new Map();
  const repos = [];
  const positional = [];
  const add = (name, value) => {
    flags.set(name, [...(flags.get(name) ?? []), value]);
    if (name === "-R" || name === "--repo") repos.push(value);
  };
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    if (t === "--") {
      positional.push(...args.slice(i + 1).map((a) => a.text));
      break;
    }
    const name = flagName(t);
    if (name === null) {
      positional.push(t);
      continue;
    }
    if (GH_VALUE_FLAGS.has(name) && takesNextToken(t, name)) {
      add(name, args[i + 1]?.text ?? "");
      i++;
      continue;
    }
    add(name, t.length > name.length ? flagValue(args, i)[0] : "");
  }
  return { flags, repos, positional };
}

const GITHUB_ITEM_URL = /(?:^|[^\w.-])(?:https?:\/\/)?(?:[^@/\s"']*@)?(?:www\.)?github\.com(?::\d+)?\/([^/\s"'#?]+\/[^/\s"'#?]+)\/(?:issues|pull|discussions)\/\d+/gi;

const GH_ACTION_ALIASES = new Map([["ls", "list"], ["new", "create"], ["co", "checkout"]]);

function ghTargetRepo(invocation, parsed, envRepo) {
  const named = [invocation.repo ?? "", ...parsed.repos].filter((r) => r.trim() !== "");
  const linked = parsed.positional.flatMap((p) => [...p.matchAll(GITHUB_ITEM_URL)].map((m) => m[1]));
  if ([...named, ...linked].some(isCodeRepo)) return repos.code;
  const selector = parsed.positional[0] ?? "";
  const whole = [...selector.matchAll(GITHUB_ITEM_URL)];
  if (whole.length === 1 && whole[0].index === 0 && !/\s/.test(selector)) return whole[0][1];
  if (named.length) return named[named.length - 1];
  return envRepo?.trim() ? envRepo : null;
}

const ENV_PRESERVING = new Set(["env", "nohup", "command", "time"]);

function assignedRepo(seg, at, inherited) {
  for (let k = at - 1; k >= 0; k--) {
    const tok = seg[k];
    const t = tok.text;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
      const m = t.match(/^GH_REPO=(.*)$/s);
      if (m) return m[1];
      continue;
    }
    if (tok.quoted) return null;
    if (REDIRECT_DUP.test(t) || REDIRECT_OP.test(t) || REDIRECT_GLUED.test(t)) continue;
    if (k > 0 && !seg[k - 1].quoted && REDIRECT_OP.test(seg[k - 1].text)) {
      k--;
      continue;
    }
    if (KEYWORDS.has(t.toLowerCase()) || ENV_PRESERVING.has(baseName(tok))) continue;
    return null;
  }
  return inherited;
}

function inheritedRepo(text, envRepo) {
  return /GH_REPO/i.test(text) ? null : envRepo;
}

function guardReason(what, hint, where = `on ${repos.code}`) {
  return [
    `Public-repository guard: ${what} ${where} is refused.`,
    `Tickets and every comment, review and discussion live in ${repos.internal}. On ${repos.code} an agent opens a pull request as a draft, pushes to it and marks it ready or back to draft, nothing else, and reads only a pull request's number, title, body, draft, merge state and checks, CI runs, files, commits, branches, rulesets and other git data.`,
    hint,
  ].join("\n");
}

const GUARD = {
  issue: () => guardReason("a gh issue command", `Name the internal repository: gh issue <command> -R ${repos.internal}`),
  prComment: () => guardReason("gh pr comment", `Post it as a comment on the ticket in ${repos.internal} instead.`),
  prReview: () => guardReason("gh pr review", `Post the review on the ticket in ${repos.internal} instead.`),
  prEdit: () => guardReason("a gh pr edit of labels, assignees, reviewers or projects", "Only --title, --body and --body-file may change on a public pull request."),
  prView: () => guardReason("a gh pr read of comments or reviews", "Read permitted fields only: gh pr view <n> --json number,title,body,isDraft,mergeStateStatus"),
  prList: () => guardReason("gh pr list without --author", "Find pull requests by author and branch: gh pr list --author @me --head <branch>"),
  search: () => guardReason("a search of issues or pull requests", `Scope the search to the internal repository: gh search issues <query> --repo ${repos.internal}`),
  api: () => guardReason("an issue, comment, review or discussion API call", `Call the same endpoint on repos/${repos.internal} instead.`),
  graphql: () => guardReason("a GraphQL query for issues, comments, reviews or discussions", `Read tickets with gh issue <command> -R ${repos.internal}, or the REST API on repos/${repos.internal}, instead.`, "of any repository"),
  discussion: () => guardReason("a gh discussion command", `Name the internal repository: gh discussion <command> -R ${repos.internal}`),
  web: () => guardReason("a web page of issues, pull request conversations or discussions", "Read the pull request's permitted fields through gh pr view --json or the API instead."),
};

function checkGhGuarded(invocation, envRepo) {
  const command = invocation.words[0];
  const action = GH_ACTION_ALIASES.get(invocation.words[1]) ?? invocation.words[1];
  if (command !== "issue" && command !== "pr" && command !== "search" && command !== "discussion") return null;
  const parsed = ghArgs(invocation.rest);
  if (command === "search") {
    if (action !== "issues" && action !== "prs") return null;
    const csv = (values) => values.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
    const named = csv([invocation.repo ?? "", ...parsed.repos]);
    const owners = csv(parsed.flags.get("--owner") ?? []).map((o) => `owner:${o}`);
    return searchScoped([...named, ...owners, ...parsed.positional].join(" "), named) ? null : GUARD.search();
  }
  const target = ghTargetRepo(invocation, parsed, envRepo);
  if (target !== null && !isCodeRepo(target)) return null;
  if (command === "issue") return GUARD.issue();
  if (command === "discussion") return GUARD.discussion();
  const has = (...names) => names.some((n) => parsed.flags.has(n));
  if (action === "comment") return GUARD.prComment();
  if (action === "review") return GUARD.prReview();
  if (action === "edit") return has("--add-label", "--remove-label", "--add-assignee", "--add-reviewer", "--add-project") ? GUARD.prEdit() : null;
  const fields = (parsed.flags.get("--json") ?? []).join(",").toLowerCase().split(/[\s,]+/);
  if (fields.some((f) => ["comments", "reviews", "latestreviews", "reviewrequests"].includes(f))) return GUARD.prView();
  if (action === "view") {
    const comments = [...(parsed.flags.get("--comments") ?? []), ...(parsed.flags.get("-c") ?? [])].some((v) => !/^(false|f|0)$/i.test(v));
    return comments || !parsed.flags.has("--json") ? GUARD.prView() : null;
  }
  if (action === "list") return has("--author", "-A") ? null : GUARD.prList();
  return null;
}

function searchScoped(text, named = []) {
  let decoded = text;
  try {
    decoded = decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
  }
  const qualifier = (key) => [...decoded.matchAll(new RegExp(`(?:^|[\\s"'&=(+])${key}:(?:"([^"]*)"|'([^']*)'|([^\\s"'&)]+))`, "gi"))].map((m) => m[1] ?? m[2] ?? m[3]);
  const all = [...named, ...qualifier("repo")];
  const owner = repos.code.split("/")[0].toLowerCase();
  const ownerNamed = qualifier("(?:org|user|owner)").some((o) => o.toLowerCase() === owner);
  const or = /(^|[\s(])OR([\s)]|$)/.test(decoded);
  return all.length > 0 && !all.some(isCodeRepo) && !ownerNamed && !or;
}

function canonicalEndpoint(raw) {
  let path = raw.replace(/^https?:\/\/[^/]+\//i, "").split("#")[0].split("?")[0];
  try {
    path = decodeURIComponent(path);
  } catch {
  }
  const out = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/").toLowerCase();
}

function guardedEndpoint(endpoint) {
  if (/^(issues|user\/issues|orgs\/[^/]+\/issues|notifications)(\/|$)/.test(endpoint)) return true;
  if (/^(events|networks\/[^/]+\/[^/]+\/events|orgs\/[^/]+\/events|users\/[^/]+\/(received_)?events)(\/|$)/.test(endpoint)) return true;
  const byId = endpoint.match(/^repositories\/\d+(?:\/(.*))?$/);
  if (byId) return guardedPath(byId[1] ?? "");
  const m = endpoint.match(/^repos\/([^/]+\/[^/]+)(?:\/(.*))?$/);
  if (!m || !isCodeRepo(m[1])) return false;
  return guardedPath(m[2] ?? "");
}

function guardedPath(path) {
  return /^(issues|pulls\/comments|events|notifications)(\/|$)/.test(path) || /^pulls\/[^/]+\/(comments|reviews|requested_reviewers)(\/|$)/.test(path) || /^discussion/.test(path);
}

export const ACCOUNT_PULL_METADATA_QUERY = `query($endCursor: String) {
  viewer {
    login
    pullRequests(first: 100, after: $endCursor, orderBy: {field: CREATED_AT, direction: DESC}) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        number state isDraft headRefName headRefOid baseRefName createdAt
        repository { nameWithOwner }
        author { login }
        mergeCommit { oid }
        closingIssuesReferences(first: 100) {
          nodes { number url }
          pageInfo { hasNextPage }
        }
      }
    }
  }
}`;

const metadataTokens = (query) => typeof query === "string" && query.replace(/[ \t\r\n,]/g, "");
export const accountPullMetadataAllowed = (query) => metadataTokens(query) === metadataTokens(ACCOUNT_PULL_METADATA_QUERY);

export function requestAccountPullMetadata(query, transport) {
  if (!accountPullMetadataAllowed(query)) throw new Error("Account pull request metadata policy refused the query before transport");
  return transport(query);
}

function graphqlReadsText(text) {
  const selections = text
    .replace(/\b(query|mutation|subscription|fragment)\s+[A-Za-z_]\w*/g, "$1")
    .replace(/\$[A-Za-z_]\w*/g, "$")
    .replace(/\b[A-Za-z_]\w*\s*:/g, ":")
    .replace(/(^|\n)[A-Za-z_][\w[\]]*=/g, "$1=");
  return /issue|comment|review|discussion|timeline/i.test(selections);
}

function checkGuardedRequest(endpoint, text, searchQuery, metadataQuery = null) {
  if (endpoint === "graphql") return accountPullMetadataAllowed(metadataQuery) ? null : graphqlReadsText(text) ? GUARD.graphql() : null;
  if (endpoint === "search/issues") return searchScoped(searchQuery ?? "") ? null : GUARD.search();
  return guardedEndpoint(endpoint) ? GUARD.api() : null;
}

function searchQueryOf(url, fields) {
  const out = [];
  const query = url.split("#")[0].split("?")[1];
  if (query) out.push(...new URLSearchParams(query).getAll("q"));
  for (const f of fields) {
    for (const part of f.split("&")) {
      const m = part.match(/^q=([\s\S]*)$/);
      if (m) out.push(m[1]);
    }
    for (const m of f.matchAll(/(?:^|[{;,(\s])["']?q["']?\s*[=:]\s*(["'])((?:(?!\1).)*)\1/g)) out.push(m[2]);
  }
  return out.join(" ");
}

function normalizeEndpoint(raw) {
  return raw
    .replace(/^https?:\/\/[^/]+\//i, "")
    .split("?")[0]
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function checkGhApi(args) {
  let method = null;
  let input = false;
  const fields = [];
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    if (t === "--") {
      positional.push(...args.slice(i + 1).map((a) => a.text));
      break;
    }
    const name = flagName(t);
    if (name === null) {
      positional.push(t);
      continue;
    }
    if (GH_API_FIELD_FLAGS.has(name)) {
      const [value, used] = flagValue(args, i);
      fields.push({ raw: name === "-f" || name === "--raw-field", value });
      i += used - 1;
      continue;
    }
    if (name === "-X" || name === "--method") {
      const [value, used] = flagValue(args, i);
      method = value.toUpperCase();
      i += used - 1;
      continue;
    }
    if (name === "--input") {
      const [, used] = flagValue(args, i);
      input = true;
      i += used - 1;
      continue;
    }
    if (GH_API_VALUE_FLAGS.has(name)) {
      const [, used] = flagValue(args, i);
      i += used - 1;
      continue;
    }
  }
  const endpoint = repos.cutover ? canonicalEndpoint(positional[0] ?? "") : normalizeEndpoint(positional[0] ?? "");

  if (endpoint === "graphql" && fields.some((f) => /createissue/i.test(f.value))) {
    return (
      "This GraphQL mutation creates an issue, and the hook cannot see whether it sets an issue type. " +
      "Use the REST call instead: " + recipe()
    );
  }
  if (repos.cutover) {
    const values = fields.map((f) => f.value);
    const metadataQuery = positional.length === 1 && positional[0] === "graphql" && !input && (method === null || method === "POST") && fields.length === 1 && fields[0].value.startsWith("query=") ? fields[0].value.slice(6) : null;
    const guarded = checkGuardedRequest(endpoint, [positional[0] ?? "", ...values].join("\n"), searchQueryOf(positional[0] ?? "", values), metadataQuery);
    if (guarded) return guarded;
  }
  if (endpoint === "graphql") return null;

  const m = endpoint.match(/^repos\/([^/]+\/[^/]+)\/issues$/);
  if (!m || !isTypedRepo(m[1])) return null;

  const creates = method === null ? fields.length > 0 || input : method === "POST";
  if (!creates) return null;

  if (input) {
    return (
      "This creates an issue from a request body file, and the hook cannot see whether the body sets an issue type " +
      "(field flags next to --input go to the query string, not the body). Use field flags instead: " + recipe()
    );
  }
  const typed = fields.some((f) => {
    const v = f.value.match(/^type=(.+)$/)?.[1];
    if (!v) return false;
    return f.raw || !/^(true|false|null|-?\d+|@.*)$/.test(v);
  });
  if (typed) return null;
  return (
    "This creates an issue without an issue type, and every ticket here carries one (Bug, Feature, or Task). " +
    "Add -f type=Bug, -f type=Feature, or -f type=Task to the same call: " + recipe()
  );
}

const COLLECTION_URL = /api\.github\.com\/repos\/([^/\s"']+\/[^/\s"']+)\/issues\/?(\?|$)/i;
const TYPE_ENTRY = /(["']type["']\s*[:=]\s*\S|(^|[{;,(&\n\r])\s*type\s*=\s*\S)/;

function bodyHasTypeField(body) {
  const inner = unwrapBody(body);
  if (/^[{[]/.test(inner)) {
    try {
      const obj = JSON.parse(inner);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) return typeof obj.type === "string" && obj.type.length > 0;
      return false;
    } catch {
    }
  }
  if (/^&?[A-Za-z0-9_][^{@(\s"'=]*=/.test(inner)) {
    const type = new URLSearchParams(inner).get("type");
    return typeof type === "string" && type.length > 0;
  }
  if (!/^(@?\{|\[)/.test(inner)) return false;
  const blanked = blankValues(inner).replace(/["']?type["']?\s*[:=]\s*(["'])\1/g, "");
  return TYPE_ENTRY.test(blanked);
}

function blankValues(text) {
  const n = text.length;
  let backslashEscapes = !text.startsWith("@{");
  const noTerminator = { '"': false, "'": false };
  let out = "";
  let k = 0;
  const isKey = (after) => {
    let j = after;
    while (j < n && " \t\r\n".includes(text[j])) j++;
    return j < n && (text[j] === "=" || text[j] === ":");
  };
  while (k < n) {
    const ch = text[k];
    if (ch === "@" && (text[k + 1] === '"' || text[k + 1] === "'") && /^\r?\n/.test(text.slice(k + 2, k + 4))) {
      const q = text[k + 1];
      const term = noTerminator[q] ? -1 : text.indexOf(`\n${q}@`, k + 2);
      if (term >= 0) {
        const body = text.slice(k + 2, term);
        out += body.trim().length ? `${q}h${q}` : `${q}${q}`;
        k = term + 3;
        continue;
      }
      noTerminator[q] = true;
    }
    if (ch === '"' || ch === "'") {
      let end = -1;
      if (ch === '"' && backslashEscapes) {
        end = scanQuote(text, k, true);
        if (end < 0) backslashEscapes = false;
      }
      if (end < 0) end = scanQuote(text, k, false);
      const close = end < 0 ? n - 1 : end;
      if (isKey(close + 1)) out += text.slice(k, close + 1);
      else out += close > k + 1 ? `${ch}h${ch}` : ch + ch;
      k = close + 1;
      continue;
    }
    out += ch;
    k++;
  }
  return out;
}

function unwrapBody(body) {
  let s = body.trim();
  const toJsonFlags = String.raw`(?:\s+-[\w-]+(?:(?:\s+|[:=]\s*)(?!-)[^\s@{(]\S*)?)*`;
  const toJsonPrefix = new RegExp(String.raw`^convertto-json${toJsonFlags}\s+(?=[$@(\[]?[{(\[])`, "i");
  const toJsonTail = new RegExp(String.raw`^\|\s*convertto-json${toJsonFlags}\s*$`, "i");
  const trailingFlags = new RegExp(String.raw`^([$@(\[].*[)}\]])${toJsonFlags}\s*$`, "is");
  for (let guard = 0; guard < 8; guard++) {
    if (/^[$@]?\(/.test(s) && s.endsWith(")")) {
      s = s.replace(/^[$@]?\(/, "").slice(0, -1).trim();
      continue;
    }
    const pipe = s.lastIndexOf("|");
    if (pipe > 0 && toJsonTail.test(s.slice(pipe))) {
      s = s.slice(0, pipe).trim();
      continue;
    }
    if (toJsonPrefix.test(s)) {
      s = s.replace(toJsonPrefix, "").trim();
      const m = /^([$@(\[])/.test(s) && !/[)}\]]$/.test(s) ? s.match(trailingFlags) : null;
      if (m) s = m[1];
      continue;
    }
    if (/^\[[^\][]+\]\s*@\{/.test(s)) {
      s = s.replace(/^\[[^\][]+\]\s*/, "");
      continue;
    }
    if (s.length >= 3 && s.startsWith("$'") && s.endsWith("'")) {
      s = s.slice(2, -1).replace(/\\(["'\\])/g, "$1");
      continue;
    }
    if (/^\$([{[]|&?[A-Za-z0-9_][^{@(\s"'=]*=)/.test(s)) {
      s = s.slice(1);
      continue;
    }
    if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
      s = s.slice(1, -1).replace(/''/g, "'");
      continue;
    }
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
      s = s.slice(1, -1).replace(/`(["`$])/g, "$1").replace(/\\(["\\])/g, "$1");
      continue;
    }
    break;
  }
  return s;
}

const CURL_VALUE = "AbcCdDeEFHKmoQrtTuUwxXyYzP";
const CURL_DATA_LONG = /^--(data(-ascii|-raw|-binary|-urlencode)?|form(-string)?|json)(=|$)/;

const HTTP_URL = /^(?:-uri:|-url:|--url=)?(?:https?:\/\/)?(?:[^@/\s"']*@)?(api\.github\.com|(?:www\.)?github\.com)(?::\d+)?\/([\s\S]*)$/i;

function checkGuardedUrl(args, curl) {
  const texts = args.map((a) => a.text);
  const text = texts.join("\n");
  if (curl && texts.some((t) => /[{}[\]]/.test(t) && /github/i.test(t.split(/["\s]/)[0]))) return GUARD.api();
  for (const arg of texts) {
    const m = arg.match(HTTP_URL);
    if (!m) continue;
    if (/^api\./i.test(m[1])) {
      const reason = checkGuardedRequest(canonicalEndpoint(m[2]), text, searchQueryOf(m[2], texts));
      if (reason) return reason;
      continue;
    }
    const page = canonicalEndpoint(m[2]).match(/^([^/]+\/[^/]+)\/(issues|pull|pulls|discussions)(\/|$)/);
    if (page && isCodeRepo(page[1]) && page[2] !== "pulls") return GUARD.web();
  }
  return null;
}

function collectionRepo(args) {
  if (!repos.cutover) {
    const token = args.find((a) => COLLECTION_URL.test(a.text));
    return token ? token.text.match(COLLECTION_URL)[1] : null;
  }
  const found = [];
  for (const a of args) {
    const m = a.text.match(HTTP_URL);
    if (!m || !/^api\./i.test(m[1])) continue;
    const c = canonicalEndpoint(m[2]).match(/^repos\/([^/]+\/[^/]+)\/issues$/);
    if (c) found.push(c[1]);
  }
  return found.find(isTypedRepo) ?? found[0] ?? null;
}

function checkCurl(args) {
  const target = collectionRepo(args);
  if (target === null || !isTypedRepo(target)) return null;
  if (repos.cutover && args.some((a) => a.text === "--next" || a.text === "-:")) {
    return "This curl batch (--next) posts to an issue collection, and the hook cannot tell which transfer carries which body. Create each issue in its own call: " + recipe();
  }
  let method = null;
  const bodies = [];
  let get = false;
  const setMethod = (value) => {
    if (value) method = value.toUpperCase();
  };
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    if (/^(-X|--request)$/.test(t)) setMethod(args[++i]?.text);
    else if (/^--request=/.test(t)) setMethod(t.slice("--request=".length));
    else if (t === "--get") get = true;
    else if (CURL_DATA_LONG.test(t)) {
      const eq = t.indexOf("=");
      bodies.push(eq > 0 ? t.slice(eq + 1) : (args[++i]?.text ?? ""));
    } else if (t.startsWith("-") && !t.startsWith("--")) {
      for (let p = 1; p < t.length; p++) {
        const ch = t[p];
        if (!CURL_VALUE.includes(ch)) {
          if (ch === "G") get = true;
          continue;
        }
        const rest = t.slice(p + 1).replace(/^=/, "");
        const value = rest.length ? rest : (args[++i]?.text ?? "");
        if (ch === "d" || ch === "F") bodies.push(value);
        else if (ch === "X") setMethod(value);
        break;
      }
    }
  }
  const creates = method === null ? bodies.length > 0 && !get : method === "POST";
  if (!creates) return null;
  if (bodies.some((b) => bodyHasTypeField(b))) return null;
  return (
    "This creates an issue without an issue type (or from a body the hook cannot read). " +
    "Use the gh recipe instead: " + recipe()
  );
}

function bodyText(seg) {
  const bodyIndex = seg.findIndex((t) => /^-body(:|$)/i.test(t.text));
  if (bodyIndex < 0) return null;
  const colon = seg[bodyIndex].text.match(/^-body:([\s\S]*)$/i);
  if (colon && colon[1]) return colon[1];
  const next = seg[bodyIndex + 1];
  return next ? next.text : "";
}

function checkInvokeRestMethod(args) {
  const target = collectionRepo(args);
  if (target === null || !isTypedRepo(target)) return null;
  const joined = args.map((a) => a.text).join(" ");
  const body = bodyText(args);
  const posts = /(^|\s)-method\s+post\b/i.test(joined) || body !== null;
  if (!posts) return null;
  if (body !== null && bodyHasTypeField(body)) return null;
  return (
    "This creates an issue without an issue type (or from a body the hook cannot read). " +
    "Use the gh recipe instead: " + recipe()
  );
}

function commandPositions(seg) {
  const positions = new Set();
  let k = 0;
  while (k < seg.length) {
    positions.add(k);
    const tok = seg[k];
    const t = tok.text;
    if (!tok.quoted && KEYWORDS.has(t.toLowerCase())) {
      k++;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
      k++;
      continue;
    }
    if (!tok.quoted && PS_ASSIGN.test(t)) {
      k++;
      if (!t.includes("=") && /^[+-]?=$/.test(seg[k]?.text ?? "")) k++;
      continue;
    }
    if (!tok.quoted && REDIRECT_DUP.test(t)) {
      k++;
      continue;
    }
    if (!tok.quoted && REDIRECT_OP.test(t)) {
      k += 2;
      continue;
    }
    if (!tok.quoted && REDIRECT_GLUED.test(t)) {
      k++;
      continue;
    }
    const wrapper = tok.quoted ? null : WRAPPERS.get(baseName(tok));
    if (!wrapper) break;
    k++;
    let positional = wrapper.positional ?? 0;
    while (k < seg.length) {
      const f = seg[k].text;
      if (f.startsWith("-")) {
        const name = flagName(f);
        k++;
        if (wrapper.flags.has(name) && takesNextToken(f, name)) k++;
        continue;
      }
      if (positional > 0) {
        positional--;
        k++;
        continue;
      }
      break;
    }
  }
  return positions;
}

function isShellCommandString(seg, i, positions) {
  const prev = seg[i - 1];
  if (!prev) return false;
  const p = prev.text.toLowerCase();
  if (p === "eval") return positions.has(i - 1);
  const at = programBefore(seg, i - 1);
  if (at < 0 || !positions.has(at)) return false;
  const program = baseName(seg[at]);
  if (program === "env") return p === "-s" || p === "--split-string";
  if (p === "<<<" || p === "/c" || p === "-c" || p.startsWith("-comm")) return true;
  return /^-[a-z]*c[a-z]*$/.test(p);
}

function programBefore(seg, flagIndex) {
  for (let k = flagIndex - 1, steps = 0; k >= 0 && steps < 16; k--, steps++) {
    const t = seg[k].text;
    const lower = t.toLowerCase();
    if (t === "--" || lower === "-file") return -1;
    if (!seg[k].quoted) {
      const base = baseName(seg[k]);
      if (SHELLS.has(base) || base === "env") return k;
      if (t.startsWith("-") || t.startsWith("/")) continue;
    }
    if (k > 0 && seg[k - 1].text.startsWith("-") && seg[k - 1].text !== "--") continue;
    return -1;
  }
  return -1;
}

export function readCommand(command, shell) {
  currentShell = shell === "powershell" ? "powershell" : "bash";
  const tokens = tokenize(command);
  const segments = [];
  let current = [];
  for (const t of tokens) {
    if (t.sep) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(t);
  }
  if (current.length) segments.push(current);
  return {
    segments: segments.map((seg) => {
      splitPsAssignments(seg);
      return { tokens: seg, positions: commandPositions(seg) };
    }),
    subs: tokens.subs,
  };
}

export { baseName, isShellCommandString, programBefore };

export function decide(command, shell, options = {}) {
  repos = options.repos ?? (defaultRepos ??= readRepos());
  return decideAt(command, shell, 0, null);
}

function decideAt(command, shell, depth, envRepo) {
  if (typeof command !== "string" || command.length === 0 || depth > 3) return null;
  if (shell !== "powershell" && shell !== "bash") return decideAt(command, "bash", depth, envRepo) ?? decideAt(command, "powershell", depth, envRepo);
  const { segments, subs } = readCommand(command, shell);
  const outerShell = shell;
  for (const sub of subs) {
    const inner = decideAt(sub, outerShell, depth + 1, inheritedRepo(sub, envRepo));
    currentShell = outerShell;
    if (inner) return inner;
  }

  for (const { tokens: seg, positions } of segments) {
    for (let i = 0; i < seg.length; i++) {
      const tok = seg[i];
      if (tok.quoted && isShellCommandString(seg, i, positions)) {
        const program = programBefore(seg, i - 1);
        const innerShell = program >= 0 && /^(pwsh|powershell)$/.test(baseName(seg[program])) ? "powershell" : program >= 0 ? "bash" : outerShell;
        const innerEnv = inheritedRepo(tok.text, assignedRepo(seg, program >= 0 ? program : i - 1, envRepo));
        const inner = decideAt(tok.text, innerShell, depth + 1, innerEnv);
        currentShell = outerShell;
        if (inner) return inner;
      }
      if (!positions.has(i)) continue;
      const base = baseName(tok);
      let reason = null;
      if (base === "gh") {
        const invocation = ghInvocation(seg.slice(i + 1));
        const { words, rest } = invocation;
        let repo = invocation.repo;
        if (repos.cutover) {
          const ghEnv = assignedRepo(seg, i, envRepo);
          reason = checkGhGuarded(invocation, ghEnv);
          if (repo === null && words[0] === "issue") repo = ghTargetRepo(invocation, ghArgs(rest), ghEnv);
        }
        if (reason) return reason;
        const action = repos.cutover ? (GH_ACTION_ALIASES.get(words[1]) ?? words[1]) : words[1];
        if (words[0] === "issue" && action === "create") reason = checkGhIssueCreate(rest, repo);
        else if (words[0] === "api") reason = checkGhApi(rest);
      } else if (base === "curl") {
        reason = (repos.cutover ? checkGuardedUrl(seg.slice(i + 1), true) : null) ?? checkCurl(seg.slice(i + 1));
      } else if (base === "invoke-restmethod" || base === "irm" || base === "invoke-webrequest" || base === "iwr") {
        reason = (repos.cutover ? checkGuardedUrl(seg.slice(i + 1), false) : null) ?? checkInvokeRestMethod(seg.slice(i + 1));
      }
      if (reason) return reason;
    }
  }
  return null;
}

function splitPsAssignments(seg) {
  const out = [];
  const head = /^\$(?:[A-Za-z_][A-Za-z0-9_:]*|\{[^}]+\})[+-]?=/;
  for (let k = 0; k < seg.length; k++) {
    let tok = seg[k];
    if (tok.quoted) {
      out.push(tok);
      continue;
    }
    let m = tok.text.match(head);
    if (!m && k > 0 && PS_ASSIGN.test(seg[k - 1].text) && !seg[k - 1].text.includes("=")) m = tok.text.match(/^[+-]?=/);
    while (m && m[0].length < tok.text.length) {
      const len = m[0].length;
      out.push({ ...tok, text: m[0], end: tok.start + len });
      tok = { ...tok, text: tok.text.slice(len), start: tok.start + len };
      m = tok.text.match(head);
    }
    out.push(tok);
  }
  seg.length = 0;
  for (const t of out) seg.push(t);
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
}

export async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let command;
  let shell;
  try {
    const payload = JSON.parse(raw);
    command = payload?.tool_input?.command;
    const tool = String(payload?.tool_name ?? "").toLowerCase();
    shell = tool === "powershell" ? "powershell" : tool === "bash" ? "bash" : undefined;
  } catch {
    repos = defaultRepos ??= readRepos();
    const checked = repos.cutover ? /\bgh\s+(issue|api|pr|search)\b/i : /\bgh\s+(issue|api)\b/i;
    const risk = repos.cutover ? `creates an untyped issue or reaches issues, comments or reviews on ${repos.code}` : "creates an untyped issue";
    if (checked.test(raw)) deny(`The typed-issue hook could not parse the tool payload, so it cannot tell whether this command ${risk}. File it with: ${recipe()}`);
    return;
  }
  const reason = decide(command, shell);
  if (reason) deny(reason);
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase();
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`typed-issue-hook: ${err?.stack ?? err}\n`);
    process.exit(1);
  });
}

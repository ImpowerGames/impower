// PreToolUse hook for the Bash and PowerShell tools: refuses any command
// that would create an issue in this repo's tracker without an issue type.
//
// Every ticket here carries one of Bug, Feature, or Task. `gh issue create`
// cannot set a type, so it is refused. The REST create endpoint can, so a
// `gh api` call that creates an issue is allowed only when one of its field
// flags is `type=<value>`. `gh api` switches to POST on its own as soon as a
// field flag is present, so the check looks at what the call does, not at
// whether `-X POST` was typed.
//
// The payload arrives on stdin as JSON. Only tool_input.command is read; the
// command is split into shell-style tokens (Bash and PowerShell quoting,
// line continuations, comments, here-doc bodies), so a mention of the phrase
// in a quoted string, a comment, or a here-doc body is not a match. A `gh`
// or `curl` token counts as an invocation only at command position: the
// start of a segment, after a shell keyword such as `do` or `then`, after
// environment assignments, or after a wrapper such as sudo, env, xargs, or
// timeout and that wrapper's own flags. A string handed to a shell's `-c`
// (or `-lc`, `-euc`), to `eval`, or to `pwsh -Command` is analysed as a
// command of its own.
//
// This is a guardrail against forgetting the type, not against evasion: an
// endpoint or method built from a shell variable, a gh alias, or a wrapper
// script is not seen.
//
// Exercised by typed-issue-hook.test.mjs next to this file, which also runs
// the exact command string .claude/settings.json ships.

import { pathToFileURL } from "node:url";

const RECIPE =
  'gh api -X POST repos/ImpowerGames/impower/issues -f title="<title>" -F body=@ticket.md -f type=Bug -f "labels[]=<label>"   (type is Bug, Feature, or Task; repeat labels[] per label)';

const THIS_REPO = "impowergames/impower";

// gh api flags that take a value which is not a request field.
const GH_API_VALUE_FLAGS = new Set(["-H", "--header", "-p", "--preview", "-q", "--jq", "-t", "--template", "--cache", "--hostname"]);
const GH_API_FIELD_FLAGS = new Set(["-f", "--raw-field", "-F", "--field"]);
// gh issue create flags that take a value.
const GH_ISSUE_CREATE_VALUE_FLAGS = new Set([
  "-t", "--title", "-b", "--body", "-F", "--body-file", "-l", "--label", "-a", "--assignee",
  "-m", "--milestone", "-p", "--project", "-T", "--template", "-R", "--repo", "--recover",
]);

// Words that may precede a program name in a segment without being the
// program, with the flags of each that take a value. `positional` is the
// number of non-flag words the wrapper consumes before the program.
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
// Shell keywords after which a command starts.
const KEYWORDS = new Set(["do", "then", "else", "elif", "if", "while", "until", "!", "%", "foreach-object"]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "ash", "busybox", "pwsh", "powershell", "cmd"]);

/** Split a command line into tokens the way Bash or PowerShell roughly would. */
export function tokenize(command) {
  const tokens = [];
  let text = "";
  let quoted = false;
  let started = false;
  const heredocs = [];
  const flush = () => {
    if (started) tokens.push({ text, quoted });
    text = "";
    quoted = false;
    started = false;
  };
  const sep = () => {
    flush();
    tokens.push({ sep: true });
  };
  let i = 0;
  const n = command.length;
  while (i < n) {
    const c = command[i];
    if (c === "'") {
      started = true;
      quoted = true;
      i++;
      while (i < n && command[i] !== "'") text += command[i++];
      i++;
      continue;
    }
    if (c === '"') {
      started = true;
      quoted = true;
      i++;
      while (i < n && command[i] !== '"') {
        if (command[i] === "\\" && i + 1 < n && '"\\$`\n'.includes(command[i + 1])) {
          i++;
          if (command[i] !== "\n") text += command[i];
          i++;
          continue;
        }
        text += command[i++];
      }
      i++;
      continue;
    }
    if (c === "\\") {
      if (i + 1 < n) {
        const next = command[i + 1];
        if (next === "\n") {
          i += 2; // Bash line continuation
          continue;
        }
        if (next === "\r" && command[i + 2] === "\n") {
          i += 3;
          continue;
        }
        started = true;
        // A backslash before a quote, space, or another backslash escapes
        // it; anywhere else it is kept, so a Windows path from the
        // PowerShell tool keeps its separators.
        text += '"\'\\ $`'.includes(next) ? next : c + next;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (c === "`") {
      if (command[i + 1] === "\n") {
        i += 2; // PowerShell line continuation
        continue;
      }
      if (command[i + 1] === "\r" && command[i + 2] === "\n") {
        i += 3;
        continue;
      }
      // At the start of a word or right after `=`, a backtick is a Bash
      // command substitution and opens a new segment. Inside a bare word it
      // is a PowerShell escape and keeps its character.
      if (started && !text.endsWith("=") && i + 1 < n && !" \t".includes(command[i + 1])) {
        text += command[i + 1];
        i += 2;
        continue;
      }
      sep();
      i++;
      continue;
    }
    if (c === "#" && !started) {
      while (i < n && command[i] !== "\n") i++; // comment to end of line
      continue;
    }
    if (c === "<" && command[i + 1] === "<" && command[i + 2] !== "<") {
      // Here-doc operator. The delimiter is recorded and the body is skipped
      // at the next newline, but only when a line equal to the delimiter
      // exists later in the command: `$((1 << 2))` is not a here-doc.
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
      if (delim && hasTerminator(command, j, delim, strip)) {
        heredocs.push({ delim, strip });
        i = j;
      } else {
        i += 2;
      }
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      flush();
      i++;
      continue;
    }
    if (c === "\n") {
      sep();
      i++;
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
      continue;
    }
    if (c === ";" || c === "|" || c === "&" || c === "(" || c === ")") {
      sep();
      i++;
      continue;
    }
    if ((c === "{" || c === "}") && !started && (i + 1 >= n || " \t\r\n;|&".includes(command[i + 1]))) {
      sep(); // a standalone brace groups commands, in Bash and in PowerShell
      i++;
      continue;
    }
    if (c === "$" && command[i + 1] === "(") {
      sep();
      i += 2;
      continue;
    }
    started = true;
    text += c;
    i++;
  }
  flush();
  return tokens;
}

/** True when a line equal to `delim` (tabs stripped for `<<-`) follows position `from`. */
function hasTerminator(command, from, delim, strip) {
  let i = command.indexOf("\n", from);
  while (i >= 0 && i < command.length) {
    let end = command.indexOf("\n", i + 1);
    if (end < 0) end = command.length;
    let line = command.slice(i + 1, end).replace(/\r$/, "");
    if (strip) line = line.replace(/^\t+/, "");
    if (line === delim) return true;
    i = end;
  }
  return false;
}

function baseName(token) {
  return token.text.replace(/\\/g, "/").split("/").pop().toLowerCase().replace(/\.exe$/, "");
}

function normalizeRepo(value) {
  const v = value.trim().replace(/^=/, "").replace(/\/+$/, "").replace(/\.git$/, "").toLowerCase();
  const m = v.match(/(?:^|[/:])([^/:]+\/[^/:]+)$/);
  return m ? m[1] : v;
}

function isThisRepo(repo) {
  const r = normalizeRepo(repo);
  return r === THIS_REPO || r === "{owner}/{repo}" || r === ":owner/:repo";
}

/** Reads `--flag value`, `--flag=value`, `-Xvalue`, `-X=value`; returns [value, tokensConsumed]. */
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

/** True when the flag token carries no joined value, so the next token is its value. */
function takesNextToken(t, name) {
  return !t.includes("=") && t.length === name.length;
}

/**
 * Reads the arguments after `gh`: the subcommand words (`api`, or `issue`
 * plus its action), the remaining tokens in order, and a repo given by
 * `-R`/`--repo` before the action. gh accepts those flags before the
 * subcommand, so `gh -R o/r issue create` and `gh issue -R o/r create` both
 * resolve here; `--hostname` is consumed the same way so its value is not
 * mistaken for a subcommand.
 */
function ghInvocation(args) {
  const words = [];
  const rest = [];
  let repo = null;
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    const wantWord = words.length === 0 || (words.length === 1 && words[0] === "issue");
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
    if (GH_ISSUE_CREATE_VALUE_FLAGS.has(name) && takesNextToken(t, name)) i++;
  }
  if (repo !== null && !isThisRepo(repo)) return null;
  return (
    "gh issue create cannot set an issue type, and every ticket here carries one (Bug, Feature, or Task). " +
    "Create the issue with one typed REST call instead: " + RECIPE
  );
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
    // Long flags are case-insensitive here; short flags keep their case
    // because -f and -F are different flags to gh.
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
    // boolean flag: --paginate, --slurp, --silent, -i, --verbose, ...
  }
  const endpoint = normalizeEndpoint(positional[0] ?? "");

  if (endpoint === "graphql") {
    if (fields.some((f) => /createissue/i.test(f.value))) {
      return (
        "This GraphQL mutation creates an issue, and the hook cannot see whether it sets an issue type. " +
        "Use the REST call instead: " + RECIPE
      );
    }
    return null;
  }

  const m = endpoint.match(/^repos\/([^/]+\/[^/]+)\/issues$/);
  if (!m || !isThisRepo(m[1])) return null;

  const creates = method === null ? fields.length > 0 || input : method === "POST";
  if (!creates) return null;

  if (input) {
    return (
      "This creates an issue from a request body file, and the hook cannot see whether the body sets an issue type " +
      "(field flags next to --input go to the query string, not the body). Use field flags instead: " + RECIPE
    );
  }
  // -F converts true, false, null, and integers to JSON values and reads
  // `@file` from a file, so none of those is a type name the hook can see.
  const typed = fields.some((f) => {
    const v = f.value.match(/^type=(.+)$/)?.[1];
    if (!v) return false;
    return f.raw || !/^(true|false|null|-?\d+|@.*)$/.test(v);
  });
  if (typed) return null;
  return (
    "This creates an issue without an issue type, and every ticket here carries one (Bug, Feature, or Task). " +
    "Add -f type=Bug, -f type=Feature, or -f type=Task to the same call: " + RECIPE
  );
}

const COLLECTION_URL = /api\.github\.com\/repos\/([^/\s"']+\/[^/\s"']+)\/issues\/?(\?|$)/i;
const TYPE_IN_BODY = /(^|[^a-z])["']?type["']?\s*[=:]/i;

/** True when text carries a `type` field (a JSON key or a hashtable entry), ignoring content-type headers and the URL. */
function mentionsTypeField(text) {
  return TYPE_IN_BODY.test(text.replace(COLLECTION_URL, "").replace(/content-type\s*[:=]/gi, ""));
}

function checkCurl(args) {
  const url = args.find((a) => COLLECTION_URL.test(a.text));
  if (!url || !isThisRepo(url.text.match(COLLECTION_URL)[1])) return null;
  let posts = false;
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    if (/^(-X|--request)$/.test(t)) posts ||= /^post$/i.test(args[i + 1]?.text ?? "");
    else if (/^(-X|--request=)/.test(t)) posts ||= /post$/i.test(t);
    else if (/^(-d|-F)/.test(t) || /^--(data|data-raw|data-binary|data-urlencode|form|json)(=|$)/.test(t)) posts = true;
  }
  if (!posts) return null;
  if (mentionsTypeField(args.map((a) => a.text).join(" "))) return null;
  return (
    "This creates an issue without an issue type (or from a body the hook cannot read). " +
    "Use the gh recipe instead: " + RECIPE
  );
}

// PowerShell splits a sub-expression body such as `-Body (@{...} | ConvertTo-Json)`
// across segments, so the type field is looked for in the whole command.
function checkInvokeRestMethod(args, command) {
  const joined = args.map((a) => a.text).join(" ");
  const url = args.find((a) => COLLECTION_URL.test(a.text));
  if (!url || !isThisRepo(url.text.match(COLLECTION_URL)[1])) return null;
  const posts = /-method\s+post\b/i.test(joined) || /(^|\s)-body\b/i.test(joined);
  if (!posts) return null;
  if (mentionsTypeField(command)) return null;
  return (
    "This creates an issue without an issue type (or from a body the hook cannot read). " +
    "Use the gh recipe instead: " + RECIPE
  );
}

/**
 * True when index i in the segment is where a program name may stand: every
 * earlier token is a shell keyword, an environment assignment, or a wrapper
 * together with its own flags, flag values, and positional arguments.
 */
function isCommandPosition(seg, i) {
  let k = 0;
  while (k < i) {
    const tok = seg[k];
    const t = tok.text;
    const lower = t.toLowerCase();
    if (!tok.quoted && KEYWORDS.has(lower)) {
      k++;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
      k++;
      continue;
    }
    const wrapper = WRAPPERS.get(baseName(tok));
    if (!wrapper || tok.quoted) return false;
    k++;
    let positional = wrapper.positional ?? 0;
    while (k < i) {
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
  return true;
}

/**
 * True when the token before a quoted string means the string is run as a
 * command: a shell's `-c` (in any short-flag cluster), `cmd /c`, a
 * PowerShell `-Command`, or `eval`.
 */
function isShellCommandFlag(seg, i) {
  const prev = seg[i - 1];
  if (!prev) return false;
  const p = prev.text.toLowerCase();
  if (p === "eval") return true;
  const program = seg[i - 2] ? baseName(seg[i - 2]) : "";
  if (!SHELLS.has(program)) return false;
  if (p === "/c" || p === "-c" || p.startsWith("-comm")) return true;
  return /^-[a-z]*c[a-z]*$/.test(p);
}

/** Returns a deny reason for the command, or null to allow it. */
export function decide(command, depth = 0) {
  if (typeof command !== "string" || command.length === 0 || depth > 3) return null;
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

  for (const seg of segments) {
    for (let i = 0; i < seg.length; i++) {
      const tok = seg[i];
      if (tok.quoted && isShellCommandFlag(seg, i)) {
        const inner = decide(tok.text, depth + 1);
        if (inner) return inner;
      }
      if (!isCommandPosition(seg, i)) continue;
      const base = baseName(tok);
      let reason = null;
      if (base === "gh") {
        const { words, rest, repo } = ghInvocation(seg.slice(i + 1));
        if (words[0] === "issue" && words[1] === "create") reason = checkGhIssueCreate(rest, repo);
        else if (words[0] === "api") reason = checkGhApi(rest);
      } else if (base === "curl") {
        reason = checkCurl(seg.slice(i + 1));
      } else if (base === "invoke-restmethod" || base === "irm" || base === "invoke-webrequest" || base === "iwr") {
        reason = checkInvokeRestMethod(seg.slice(i + 1), command);
      }
      if (reason) return reason;
    }
  }
  return null;
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

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let command;
  try {
    command = JSON.parse(raw)?.tool_input?.command;
  } catch {
    // An unparseable payload is refused only when it looks like it carries a
    // gh call, so a broken harness cannot let an untyped create through and
    // cannot block unrelated commands either.
    if (/\bgh\s+(issue|api)\b/i.test(raw)) deny("The typed-issue hook could not parse the tool payload, so it cannot tell whether this command creates an untyped issue. " + RECIPE);
    return;
  }
  const reason = decide(command);
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

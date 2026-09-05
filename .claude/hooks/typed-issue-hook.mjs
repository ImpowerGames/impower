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
// or `curl` token counts as an invocation only at the start of a command
// segment, after environment assignments, or after a wrapper such as sudo,
// npx, env, or xargs; a string handed to `bash -c`, `sh -lc`, `eval`, or
// `pwsh -Command` is analysed as a command of its own.
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
// Words that may precede a program name in a segment without being the program.
const WRAPPERS = new Set(["sudo", "npx", "time", "command", "exec", "nohup", "xargs", "env", "builtin", "&", "doas"]);

/** Split a command line into tokens the way Bash or PowerShell roughly would. */
export function tokenize(command) {
  const tokens = [];
  let text = "";
  let quoted = false;
  let started = false;
  let heredocs = [];
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
      // Bash command substitution opens a new segment; a PowerShell escape
      // inside a bare word is kept as its character.
      if (started && i + 1 < n && !" \t".includes(command[i + 1])) {
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
      // Here-doc: record the delimiter; the body is skipped at the newline.
      i += 2;
      if (command[i] === "-") i++;
      while (i < n && " \t".includes(command[i])) i++;
      let delim = "";
      let q = null;
      while (i < n && !" \t\n;|&".includes(command[i])) {
        const ch = command[i++];
        if (ch === "'" || ch === '"') {
          q = q === ch ? null : q ?? ch;
          continue;
        }
        if (ch === "\\" && i < n) {
          delim += command[i++];
          continue;
        }
        delim += ch;
      }
      if (delim) heredocs.push(delim);
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
        const delim = heredocs.shift();
        while (i < n) {
          let end = command.indexOf("\n", i);
          if (end < 0) end = n;
          const line = command.slice(i, end).replace(/^\t+/, "").replace(/\r$/, "");
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
    if (GH_ISSUE_CREATE_VALUE_FLAGS.has(name) && !t.includes("=") && t.length === name.length) i++;
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
  // -F converts true, false, null, and integers to JSON values, so those are
  // not a type name.
  const typed = fields.some((f) => {
    const v = f.value.match(/^type=(.+)$/)?.[1];
    if (!v) return false;
    return f.raw || !/^(true|false|null|-?\d+)$/.test(v);
  });
  if (typed) return null;
  return (
    "This creates an issue without an issue type, and every ticket here carries one (Bug, Feature, or Task). " +
    "Add -f type=Bug, -f type=Feature, or -f type=Task to the same call: " + RECIPE
  );
}

const COLLECTION_URL = /api\.github\.com\/repos\/([^/\s"']+\/[^/\s"']+)\/issues\/?(\?|$)/i;

function checkCurl(args) {
  const joined = args.map((a) => a.text).join(" ");
  const url = args.find((a) => COLLECTION_URL.test(a.text));
  if (!url || !isThisRepo(url.text.match(COLLECTION_URL)[1])) return null;
  const posts =
    /(^|\s)(-X|--request)\s*=?\s*post(\s|$)/i.test(joined) ||
    /(^|\s)(-d|--data|--data-raw|--data-binary|--json|-F|--form)(\s|=)/.test(joined);
  if (!posts) return null;
  if (/"type"\s*:/.test(joined)) return null;
  return (
    "This creates an issue without an issue type (or from a body the hook cannot read). " +
    "Use the gh recipe instead: " + RECIPE
  );
}

function checkInvokeRestMethod(args) {
  const joined = args.map((a) => a.text).join(" ");
  const url = args.find((a) => COLLECTION_URL.test(a.text));
  if (!url || !isThisRepo(url.text.match(COLLECTION_URL)[1])) return null;
  const posts = /-method\s+post\b/i.test(joined) || /-body\b/i.test(joined);
  if (!posts) return null;
  if (/type/i.test(joined.replace(COLLECTION_URL, ""))) return null;
  return (
    "This creates an issue without an issue type (or from a body the hook cannot read). " +
    "Use the gh recipe instead: " + RECIPE
  );
}

/** True when every token before index i in the segment is a prefix a program name may follow. */
function isCommandPosition(seg, i) {
  for (let k = 0; k < i; k++) {
    const t = seg[k].text;
    if (seg[k].quoted) return false;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue; // FOO=bar
    if (t.startsWith("-")) continue; // a wrapper's own flag, e.g. env -u X
    if (WRAPPERS.has(t.toLowerCase())) continue;
    return false;
  }
  return true;
}

function isShellCommandFlag(prev) {
  if (!prev) return false;
  const p = prev.toLowerCase();
  if (p === "eval" || p === "/c" || p === "-c") return true;
  if (p.startsWith("-comm")) return true; // PowerShell -Command and its prefixes
  return /^-[a-z]*c[a-z]*$/.test(p); // -lc, -euc, -xc
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
      if (tok.quoted && isShellCommandFlag(seg[i - 1]?.text)) {
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
        reason = checkInvokeRestMethod(seg.slice(i + 1));
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

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
// command is split into shell-style tokens, so a mention of the phrase inside
// a quoted string (a commit message, a comment body) is not a match, while a
// string handed to `bash -c`, `sh -c`, `eval`, or `pwsh -Command` is analysed
// as a command of its own.
//
// Exercised by typed-issue-hook.test.mjs next to this file, which also runs
// the exact command string .claude/settings.json ships.

import { pathToFileURL } from "node:url";

const RECIPE =
  'gh api -X POST repos/ImpowerGames/impower/issues -f title="<title>" -F body=@ticket.md -f type=Bug -f "labels[]=<label>"   (type is Bug, Feature, or Task; repeat labels[] per label)';

const THIS_REPO = "impowergames/impower";

// Fields whose values do not belong to the request body.
const GH_API_VALUE_FLAGS = new Set([
  "-H", "--header",
  "-p", "--preview",
  "-q", "--jq",
  "-t", "--template",
  "--cache",
  "--hostname",
]);
const GH_API_FIELD_FLAGS = new Set(["-f", "--raw-field", "-F", "--field"]);

/** Split a command line into tokens the way a POSIX shell roughly would. */
export function tokenize(command) {
  const tokens = [];
  let text = "";
  let quoted = false;
  let started = false;
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
          i += 2; // line continuation
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
    if (c === " " || c === "\t" || c === "\r") {
      flush();
      i++;
      continue;
    }
    if (c === "\n" || c === ";" || c === "|" || c === "&" || c === "(" || c === ")") {
      sep();
      i++;
      continue;
    }
    if (c === "$" && command[i + 1] === "(") {
      sep();
      i += 2;
      continue;
    }
    if (c === "`") {
      sep();
      i++;
      continue;
    }
    started = true;
    text += c;
    i++;
  }
  flush();
  return tokens;
}

function isGh(token) {
  const base = token.text.replace(/\\/g, "/").split("/").pop().toLowerCase();
  return base === "gh" || base === "gh.exe";
}

function normalizeRepo(value) {
  const v = value.trim().replace(/\/+$/, "").toLowerCase();
  const m = v.match(/(?:^|[/:])([^/:]+\/[^/:]+)$/);
  return m ? m[1] : v;
}

function isThisRepo(repo) {
  const r = normalizeRepo(repo);
  return r === THIS_REPO || r === "{owner}/{repo}" || r === ":owner/:repo";
}

/** Reads `--flag value` and `--flag=value`; returns [value, tokensConsumed]. */
function flagValue(args, i) {
  const t = args[i].text;
  const eq = t.indexOf("=");
  if (t.startsWith("--") && eq > 0) return [t.slice(eq + 1), 1];
  if (!t.startsWith("--") && t.length > 2) return [t.slice(2), 1];
  return [args[i + 1]?.text ?? "", 2];
}

function checkGhIssueCreate(args) {
  let repo = null;
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    if (t === "-R" || t === "--repo" || t.startsWith("--repo=") || (t.startsWith("-R") && t.length > 2)) {
      [repo] = flagValue(args, i);
    }
  }
  if (repo !== null && !isThisRepo(repo)) return null;
  return (
    "gh issue create cannot set an issue type, and every ticket here carries one (Bug, Feature, or Task). " +
    "Create the issue with one typed REST call instead: " + RECIPE
  );
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
    const flagName = t.startsWith("--") ? t.toLowerCase().split("=")[0] : t.startsWith("-") ? t.slice(0, 2) : null;
    if (flagName === null) {
      positional.push(t);
      continue;
    }
    if (GH_API_FIELD_FLAGS.has(flagName)) {
      const [value, used] = flagValue(args, i);
      fields.push(value);
      i += used - 1;
      continue;
    }
    if (flagName === "-X" || flagName === "--method") {
      const [value, used] = flagValue(args, i);
      method = value.toUpperCase();
      i += used - 1;
      continue;
    }
    if (flagName === "--input") {
      const [, used] = flagValue(args, i);
      input = true;
      i += used - 1;
      continue;
    }
    if (GH_API_VALUE_FLAGS.has(flagName)) {
      const [, used] = flagValue(args, i);
      i += used - 1;
      continue;
    }
    // boolean flag: --paginate, --slurp, --silent, -i, --verbose, ...
  }
  const endpoint = (positional[0] ?? "").split("?")[0].replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();

  if (endpoint === "graphql") {
    if (fields.some((f) => /createissue/i.test(f))) {
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
  const typed = fields.some((f) => /^type=.+/.test(f));
  if (typed) return null;
  return (
    "This creates an issue without an issue type, and every ticket here carries one (Bug, Feature, or Task). " +
    "Add -f type=Bug, -f type=Feature, or -f type=Task to the same call: " + RECIPE
  );
}

function checkCurl(args) {
  const joined = args.map((a) => a.text).join(" ");
  const url = args.find((a) => /api\.github\.com\/repos\/[^/\s]+\/[^/\s]+\/issues(\?|$)/i.test(a.text));
  if (!url) return null;
  const repo = url.text.match(/repos\/([^/\s]+\/[^/\s]+)\/issues/i)[1];
  if (!isThisRepo(repo)) return null;
  const posts = /(^|\s)(-X|--request)\s*=?\s*post(\s|$)/i.test(joined) || /(^|\s)(-d|--data|--data-raw|--data-binary|--json)(\s|=)/.test(joined);
  if (!posts) return null;
  if (/"type"\s*:/.test(joined)) return null;
  return (
    "This creates an issue without an issue type (or from a body the hook cannot read). " +
    "Use the gh recipe instead: " + RECIPE
  );
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
      const prev = seg[i - 1]?.text.toLowerCase();
      if (tok.quoted && (prev === "-c" || prev === "-command" || prev === "/c" || prev === "eval")) {
        const inner = decide(tok.text, depth + 1);
        if (inner) return inner;
      }
      if (!isGh(tok)) continue;
      const args = seg.slice(i + 1);
      const sub = args[0]?.text.toLowerCase();
      let reason = null;
      if (sub === "issue" && args[1]?.text.toLowerCase() === "create") reason = checkGhIssueCreate(args.slice(2));
      else if (sub === "api") reason = checkGhApi(args.slice(1));
      if (reason) return reason;
    }
    const first = seg[0]?.text.replace(/\\/g, "/").split("/").pop().toLowerCase();
    if (first === "curl" || first === "curl.exe") {
      const reason = checkCurl(seg.slice(1));
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

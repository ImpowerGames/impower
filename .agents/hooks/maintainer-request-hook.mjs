import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readRepos, ticketsRepo } from "../repos.mjs";
import { RequestIndexUnreadable, isAnswered, openRequestIndex } from "../skills/ask-maintainer/request-index.mjs";
import { baseName, isShellCommandString, programBefore, readCommand } from "./typed-issue-hook.mjs";

const TOOL = "node .agents/skills/ask-maintainer/maintainer-request.mjs";
const MUTATING_ISSUE_ACTIONS = new Set(["comment", "edit", "close", "reopen", "delete", "lock", "unlock", "pin", "unpin", "transfer"]);
const PUBLISHING = { issue: new Set(["create", "new", "comment", "edit", "close", "reopen"]), pr: new Set(["create", "new", "comment", "edit", "review", "close", "merge", "reopen"]) };
const TEXT_FLAGS = new Set(["-b", "--body", "-t", "--title", "-c", "--comment", "--subject"]);
const FILE_FLAGS = new Set(["-F", "--body-file"]);
const GH_VALUE_FLAGS = new Set([
  "-R", "--repo", "-b", "--body", "-F", "--body-file", "-t", "--title", "-c", "--comment", "-r", "--reason", "-l", "--label", "-a", "--assignee",
  "-m", "--milestone", "-p", "--project", "-T", "--template", "-B", "--base", "-H", "--head", "--subject", "--add-label", "--remove-label",
  "--add-assignee", "--remove-assignee", "--add-project", "--remove-project", "--add-reviewer", "--remove-reviewer", "--duplicate-of", "--hostname",
  "--match-head-commit", "--recover", "--type", "--author-email", "-q", "--jq", "--json",
]);
const GH_API_VALUE_FLAGS = new Set(["-H", "--header", "-p", "--preview", "-q", "--jq", "-t", "--template", "--cache", "--hostname", "-X", "--method", "--input"]);
const GH_API_FIELD_FLAGS = new Set(["-f", "--raw-field", "-F", "--field"]);
const CURL_VALUE = new Set(["-X", "--request", "-H", "--header", "-o", "--output", "-u", "--user", "-A", "--user-agent", "-e", "--referer", "-w", "--write-out", "-K", "--config"]);
const CURL_DATA = /^(-d|--data(-ascii|-raw|-binary|-urlencode)?|--json|-F|--form(-string)?)$/;

const flagName = (t) => (t.startsWith("--") ? t.split("=")[0].toLowerCase() : t.startsWith("-") && t.length > 1 ? t.slice(0, 2) : null);

function flagValue(args, i) {
  const t = args[i].text;
  const eq = t.indexOf("=");
  if (t.startsWith("--") && eq > 0) return [t.slice(eq + 1), 1];
  if (!t.startsWith("--") && t.length > 2) return [t.slice(2).replace(/^=/, ""), 1];
  return [args[i + 1]?.text ?? "", 2];
}

function parseArgs(args, valueFlags) {
  const flags = [];
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    if (t === "--") {
      positional.push(...args.slice(i + 1).map((a) => a.text));
      break;
    }
    const name = flagName(t);
    if (name === null || t === "-") {
      positional.push(t);
      continue;
    }
    if (valueFlags.has(name)) {
      const [value, used] = flagValue(args, i);
      flags.push([name, value]);
      i += used - 1;
    } else flags.push([name, ""]);
  }
  return { flags, positional, values: (...names) => flags.filter(([n]) => names.includes(n)).map(([, v]) => v) };
}

function ghParse(args) {
  const group = args.findIndex((a) => !a.text.startsWith("-"));
  const api = group >= 0 && args[group].text.toLowerCase() === "api";
  return parseArgs(args, api ? new Set([...GH_API_VALUE_FLAGS, ...GH_API_FIELD_FLAGS]) : GH_VALUE_FLAGS);
}

const sameRepo = (a, b) => typeof a === "string" && a.replace(/\.git$/, "").toLowerCase() === b.toLowerCase();

function requestNumber(selector, repo) {
  if (/^#?[1-9]\d*$/.test(selector ?? "")) return { number: Number(selector.replace(/^#/, "")), repo: null };
  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+\/[^/\s]+)\/issues\/([1-9]\d*)(?:[/?#].*)?$/i.exec(selector ?? "");
  return url ? { number: Number(url[2]), repo: url[1] } : null;
}

function envRepo(seg, at) {
  for (let k = at - 1; k >= 0; k--) {
    const m = /^GH_REPO=(.*)$/s.exec(seg[k].text);
    if (m) return m[1];
  }
  return null;
}

function apiTarget(raw, repo) {
  const endpoint = raw.replace(/^https?:\/\/[^/]+\//i, "").split(/[?#]/)[0].replace(/^\/+/, "");
  const m = /^repos\/([^/]+\/[^/]+)\/issues\/([1-9]\d*)(?:\/|$)/i.exec(endpoint);
  return m && sameRepo(m[1], repo) ? Number(m[2]) : null;
}

function touches(seg, i, repo) {
  const base = baseName(seg[i]);
  const args = seg.slice(i + 1);
  if (base === "gh") {
    const parsed = ghParse(args);
    const [group, action, selector] = parsed.positional.map((p, k) => (k < 2 ? p.toLowerCase() : p));
    if (group === "issue" && MUTATING_ISSUE_ACTIONS.has(action)) {
      const target = requestNumber(selector, repo);
      if (!target) return null;
      const named = parsed.values("-R", "--repo").at(-1) ?? target.repo ?? envRepo(seg, i);
      return sameRepo(named, repo) ? { number: target.number, action } : null;
    }
    if (group === "api") {
      const number = apiTarget(parsed.positional[1] ?? "", repo);
      if (number === null) return null;
      const method = (parsed.values("-X", "--method").at(-1) ?? (parsed.values(...GH_API_FIELD_FLAGS, "--input").length ? "POST" : "GET")).toUpperCase();
      return method === "GET" || method === "HEAD" ? null : { number, action: "api" };
    }
    return null;
  }
  if (base === "curl") {
    const parsed = parseArgs(args, new Set([...CURL_VALUE, "-d", "--data", "--data-ascii", "--data-raw", "--data-binary", "--data-urlencode", "--json", "-F", "--form", "--form-string", "--url"]));
    const url = [...parsed.values("--url"), ...parsed.positional].find((p) => /api\.github\.com\//i.test(p));
    const number = url ? apiTarget(url, repo) : null;
    if (number === null) return null;
    const method = (parsed.values("-X", "--request").at(-1) ?? (parsed.flags.some(([n]) => CURL_DATA.test(n)) ? "POST" : "GET")).toUpperCase();
    return method === "GET" || method === "HEAD" ? null : { number, action: "api" };
  }
  if (["invoke-restmethod", "irm", "invoke-webrequest", "iwr"].includes(base)) {
    let url = null;
    let method = null;
    let body = false;
    for (let k = 0; k < args.length; k++) {
      const t = args[k].text.toLowerCase();
      if (t === "-uri" || t === "-url") url = args[++k]?.text ?? null;
      else if (t === "-method") method = (args[++k]?.text ?? "").toUpperCase();
      else if (t === "-body") body = true;
      else if (!t.startsWith("-") && url === null && /api\.github\.com\//i.test(args[k].text)) url = args[k].text;
    }
    const number = url ? apiTarget(url, repo) : null;
    if (number === null) return null;
    const verb = method ?? (body ? "POST" : "GET");
    return verb === "GET" || verb === "HEAD" ? null : { number, action: "api" };
  }
  return null;
}

function indexFailure(problem) {
  return `The maintainer request guard cannot check this command because ${problem}. Run \`${TOOL} list\` to build the index from GitHub, then run the command again.`;
}

const NEXT_STEP = {
  comment: `To answer the maintainer's question on it, revise the request: \`${TOOL} revise <N> <request.json> <what-changed.md>\`.`,
  edit: `To change it, revise the request: \`${TOOL} revise <N> <request.json> <what-changed.md>\`.`,
  close: `When nothing waits on it any more, withdraw it: \`${TOOL} withdraw <N> <reason>\`. Its answer is the maintainer's close, never yours.`,
  reopen: `\`${TOOL} revise <N> <request.json> <what-changed.md>\` reopens a request whose answer is unclear.`,
};

function touchReason({ number, action }, repo) {
  const next = (NEXT_STEP[action] ?? `Use the tool's commands: \`${TOOL} read|record|revise|withdraw|wait <N>\`.`).replaceAll("<N>", String(number));
  return `${repo}#${number} is a maintainer request, and only the ask-maintainer tool comments on, edits, closes or reopens one: an agent posts with the maintainer's login, so a direct comment or close would read as the maintainer's own answer. ${next} Read the answer with \`${TOOL} read ${number}\` and record it with \`${TOOL} record ${number}\`.`;
}

function readBodyFile(file, cwd) {
  try {
    return readFileSync(path.resolve(cwd ?? process.cwd(), file), "utf8");
  } catch {
    return null;
  }
}

function publishedText(seg, i, command, cwd) {
  const base = baseName(seg[i]);
  const args = seg.slice(i + 1);
  const texts = [];
  let whole = false;
  const file = (name) => {
    if (name === "-" || name === "@-" || name === "") {
      whole = true;
      return;
    }
    const text = readBodyFile(name.replace(/^@/, ""), cwd);
    if (text === null) whole = true;
    else texts.push(text);
  };
  if (base === "gh") {
    const parsed = ghParse(args);
    const [group, action] = parsed.positional.map((p) => p.toLowerCase());
    if (PUBLISHING[group]?.has(action)) {
      texts.push(...parsed.values(...TEXT_FLAGS));
      for (const name of parsed.values(...FILE_FLAGS)) file(name);
    } else if (group === "api") {
      for (const [name, value] of parsed.flags) {
        if (GH_API_FIELD_FLAGS.has(name)) {
          const m = /^(body|title)=([\s\S]*)$/.exec(value);
          if (!m) continue;
          if (name !== "-f" && name !== "--raw-field" && m[2].startsWith("@")) file(m[2]);
          else texts.push(m[2]);
        } else if (name === "--input") file(value);
      }
    }
  } else if (base === "curl") {
    for (let k = 0; k < args.length; k++) {
      const name = flagName(args[k].text);
      if (name === null || !CURL_DATA.test(name)) continue;
      const [value, used] = flagValue(args, k);
      k += used - 1;
      if (value.startsWith("@")) file(value);
      else texts.push(value);
    }
  } else if (["invoke-restmethod", "irm", "invoke-webrequest", "iwr"].includes(base)) {
    for (let k = 0; k < args.length; k++) if (args[k].text.toLowerCase() === "-body") {
      const value = args[k + 1];
      if (value?.quoted) texts.push(value.text);
      else whole = true;
    }
  }
  if (whole) texts.push(command);
  return texts;
}

function unquoted(text) {
  return text
    .replace(/^ {0,3}(```|~~~)[\s\S]*?^ {0,3}\1[^\n]*$/gm, " ")
    .replace(/`[^`\n]*`/g, " ")
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .replace(/"[^"\n]*"/g, " ")
    .replace(/“[^”\n]*”/g, " ");
}

const VERBS = "decided|decides|approved|approves|agreed|agrees|chose|chosen|chooses|accepted|accepts|confirmed|confirms|signed\\s+off|okayed";
const HEDGE = /\b(not|never|no|yet|whether|if|to|should|would|will|may|might|can|could|must|once|until|unless|before)\b|n['’]t\b/i;

export function decisionClaim(text, login) {
  const who = `(?:maintainer|${login.replace(/[-]/g, "\\-")})`;
  const plain = unquoted(text);
  const active = new RegExp(`\\b${who}(?:['’]s)?\\b((?:[ \\t]+[\\w'’-]+){0,3}?)[ \\t]+(?:${VERBS})\\b`, "gi");
  for (const m of plain.matchAll(active)) if (!HEDGE.test(m[1])) return m[0].trim();
  const fixed = [
    new RegExp(`\\b(?:${VERBS})\\b(?:[ \\t]+[\\w'’-]+){0,2}?[ \\t]+(?:by|with)[ \\t]+(?:the[ \\t]+)?${who}\\b`, "i"),
    new RegExp(`\\bper[ \\t]+(?:the[ \\t]+)?${who}\\b`, "i"),
    new RegExp(`\\b${who}['’]s[ \\t]+(?:decision|choice|approval|ruling|sign-off|instruction)\\b`, "i"),
  ];
  for (const pattern of fixed) {
    const m = pattern.exec(plain);
    if (m) return m[0].trim();
  }
  return null;
}

export function citedRequests(text, repos = readRepos()) {
  const repo = ticketsRepo(repos);
  const [owner, name] = repo.split("/").map((part) => part.replace(/[.-]/g, (c) => `\\${c}`));
  const prefix = repos.autolinkPrefix.replace(/-/g, "\\-");
  const patterns = [
    /(?<![\w/&])#([1-9]\d*)\b/g,
    new RegExp(`\\b${prefix}([1-9]\\d*)\\b`, "g"),
    new RegExp(`\\b${owner}/${name}#([1-9]\\d*)\\b`, "gi"),
    new RegExp(`(?<![\\w-])${name}#([1-9]\\d*)\\b`, "gi"),
    new RegExp(`github\\.com/${owner}/${name}/issues/([1-9]\\d*)\\b`, "gi"),
  ];
  return [...new Set(patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((m) => Number(m[1]))))];
}

function claimReason(texts, repos, env) {
  const login = repos.maintainer.login;
  let claim = null;
  for (const text of texts) {
    claim = decisionClaim(text, login);
    if (claim) break;
  }
  if (!claim) return null;
  const cited = [...new Set(texts.flatMap((text) => citedRequests(text, repos)))];
  const repo = ticketsRepo(repos);
  const advice = `A decision is the maintainer's only when they answered a maintainer request: cite that request (after \`${TOOL} record <N>\` has read its answer), file one with \`${TOOL} file\`, or write "decided by fallback" when an agent went ahead because no answer came. Quoting an existing record in a blockquote or in quotation marks passes.`;
  if (!cited.length) return `This text claims a maintainer decision ("${claim}") and cites no answered maintainer request in ${repo}. ${advice}`;
  let index;
  try {
    index = openRequestIndex(repo, env);
    if (cited.some((number) => isAnswered(index.entry(number)))) return null;
  } catch (error) {
    if (error instanceof RequestIndexUnreadable) return indexFailure(error.message);
    throw error;
  }
  const known = cited.map((number) => [number, index.entry(number)]).filter(([, entry]) => entry);
  const states = known.length ? ` The index has ${known.map(([number, entry]) => `#${number} as ${entry.state}`).join(", ")}; \`${TOOL} read <N>\` refreshes it.` : "";
  return `This text claims a maintainer decision ("${claim}") and none of the issues it cites (${cited.map((n) => `#${n}`).join(", ")}) is an answered maintainer request in ${repo}.${states} ${advice}`;
}

function decideAt(command, shell, depth, context) {
  if (typeof command !== "string" || command.length === 0 || depth > 3) return null;
  if (shell !== "powershell" && shell !== "bash") return decideAt(command, "bash", depth, context) ?? decideAt(command, "powershell", depth, context);
  const { segments, subs } = readCommand(command, shell);
  for (const sub of subs) {
    const inner = decideAt(sub, shell, depth + 1, context);
    if (inner) return inner;
  }
  for (const { tokens: seg, positions } of segments) {
    for (let i = 0; i < seg.length; i++) {
      const tok = seg[i];
      if (tok.quoted && isShellCommandString(seg, i, positions)) {
        const program = programBefore(seg, i - 1);
        const innerShell = program >= 0 && /^(pwsh|powershell)$/.test(baseName(seg[program])) ? "powershell" : program >= 0 ? "bash" : shell;
        const inner = decideAt(tok.text, innerShell, depth + 1, context);
        if (inner) return inner;
      }
      if (!positions.has(i) || !["gh", "curl", "invoke-restmethod", "irm", "invoke-webrequest", "iwr"].includes(baseName(tok))) continue;
      const touched = touches(seg, i, context.repo);
      if (touched) {
        try {
          if (openRequestIndex(context.repo, context.env).entry(touched.number)) return touchReason(touched, context.repo);
        } catch (error) {
          if (error instanceof RequestIndexUnreadable) return indexFailure(error.message);
          throw error;
        }
      }
      const claim = claimReason(publishedText(seg, i, command, context.cwd), context.repos, context.env);
      if (claim) return claim;
    }
  }
  return null;
}

export function decide(command, shell, { cwd, repos = readRepos(), env = process.env } = {}) {
  return decideAt(command, shell, 0, { cwd, repos, repo: ticketsRepo(repos), env });
}

export async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const payload = JSON.parse(raw);
  const tool = String(payload?.tool_name ?? "").toLowerCase();
  const command = payload?.tool_input?.command;
  const reason = decide(command, tool === "powershell" ? "powershell" : tool === "bash" ? "bash" : undefined, { cwd: typeof payload.cwd === "string" && payload.cwd ? payload.cwd : undefined });
  if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase()) {
  main().catch((error) => {
    console.error(`maintainer-request hook: ${error?.stack ?? error}`);
    process.exitCode = 2;
  });
}

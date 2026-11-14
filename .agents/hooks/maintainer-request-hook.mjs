import { readFileSync } from "node:fs";
import os from "node:os";
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
    if (!t.startsWith("--")) {
      for (let p = 1; p < t.length; p++) {
        const letter = `-${t[p]}`;
        if (!valueFlags.has(letter)) {
          flags.push([letter, ""]);
          continue;
        }
        const rest = t.slice(p + 1).replace(/^=/, "");
        flags.push([letter, rest.length ? rest : (args[++i]?.text ?? "")]);
        break;
      }
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

function normalizeRepo(value) {
  const v = value.trim().replace(/^=/, "").replace(/\/+$/, "").replace(/\.git$/i, "").toLowerCase();
  return /(?:^|[/:])([^/:]+\/[^/:]+)$/.exec(v)?.[1] ?? v;
}

const sameRepo = (a, b) => typeof a === "string" && typeof b === "string" && normalizeRepo(a) === normalizeRepo(b);

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

const endpointOf = (raw) => raw.replace(/^https?:\/\/[^/]+\//i, "").split(/[?#]/)[0].replace(/^\/+/, "");
const endpointRepo = (raw) => /^repos\/([^/]+\/[^/]+)(?:\/|$)/i.exec(endpointOf(raw))?.[1] ?? null;
const githubUrl = (value) => /^(?:https?:\/\/)?(?:[^@/\s"']*@)?(?:api\.github\.com|(?:www\.)?github\.com)(?::\d+)?\//i.test(value ?? "");

function apiTarget(raw, repo) {
  const m = /^repos\/([^/]+\/[^/]+)\/issues\/([1-9]\d*)(?:\/|$)/i.exec(endpointOf(raw));
  return m && sameRepo(m[1], repo) ? Number(m[2]) : null;
}

function touches(seg, i, repo) {
  const base = baseName(seg[i]);
  const args = seg.slice(i + 1);
  if (base === "gh") {
    const parsed = ghParse(args);
    const [group, action, ...selectors] = parsed.positional.map((p, k) => (k < 2 ? p.toLowerCase() : p));
    if (group === "issue" && MUTATING_ISSUE_ACTIONS.has(action)) {
      const named = parsed.values("-R", "--repo").at(-1) ?? envRepo(seg, i);
      const targets = selectors.map((selector) => requestNumber(selector, repo)).filter((target) => target && sameRepo(target.repo ?? named, repo));
      return targets.length ? { numbers: targets.map((target) => target.number), action } : null;
    }
    if (group === "api") {
      const number = apiTarget(parsed.positional[1] ?? "", repo);
      if (number === null) return null;
      const method = (parsed.values("-X", "--method").at(-1) ?? (parsed.values(...GH_API_FIELD_FLAGS, "--input").length ? "POST" : "GET")).toUpperCase();
      return method === "GET" || method === "HEAD" ? null : { numbers: [number], action: "api" };
    }
    return null;
  }
  const requests = base === "curl" ? curlTransfers(args) : WEB_REQUEST.has(base) ? [webRequest(args)] : [];
  const numbers = requests.filter(changes).flatMap((request) => request.urls.filter(githubUrl).map((url) => apiTarget(url, repo))).filter((n) => n !== null);
  return numbers.length ? { numbers, action: "api" } : null;
}

const WEB_REQUEST = new Set(["invoke-restmethod", "irm", "invoke-webrequest", "iwr"]);
const CURL_SHORT_VALUE = "AbcCdDeEFHKmoQrtTuUwxXyYzP";
const CURL_LONG_VALUE = new Set(["--header", "--output", "--user", "--user-agent", "--referer", "--write-out", "--config", "--cookie", "--cookie-jar", "--cacert", "--cert", "--key", "--proxy", "--max-time", "--connect-timeout", "--retry", "--range", "--resolve", "--connect-to", "--oauth2-bearer", "--variable", "--expand-url"]);
const CURL_LONG_DATA = /^--(data(-ascii|-raw|-binary|-urlencode)?|form(-string)?|json)$/;

function curlTransfers(args) {
  const transfers = [];
  let current = null;
  const start = () => transfers.push((current = { urls: [], method: null, data: [], get: false, upload: false }));
  start();
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    if (t === "--next" || t === "-:") {
      start();
      continue;
    }
    const eq = t.startsWith("--") ? t.indexOf("=") : -1;
    const name = eq > 0 ? t.slice(0, eq) : t;
    const value = () => (eq > 0 ? t.slice(eq + 1) : (args[++i]?.text ?? ""));
    if (name === "--request") current.method = value().toUpperCase();
    else if (name === "--url") current.urls.push(value());
    else if (name === "--get") current.get = true;
    else if (name === "--upload-file") {
      value();
      current.upload = true;
    } else if (CURL_LONG_DATA.test(name)) current.data.push({ kind: name === "--json" ? "json" : name.startsWith("--form") ? "form" : name === "--data-raw" ? "raw" : "data", value: value() });
    else if (CURL_LONG_VALUE.has(name)) value();
    else if (t.startsWith("--")) continue;
    else if (t.startsWith("-") && t.length > 1) {
      for (let p = 1; p < t.length; p++) {
        const ch = t[p];
        if (!CURL_SHORT_VALUE.includes(ch)) {
          if (ch === "G") current.get = true;
          continue;
        }
        const rest = t.slice(p + 1).replace(/^=/, "");
        const v = rest.length ? rest : (args[++i]?.text ?? "");
        if (ch === "d" || ch === "F") current.data.push({ kind: ch === "d" ? "data" : "form", value: v });
        else if (ch === "X") current.method = v.toUpperCase();
        else if (ch === "T") current.upload = true;
        break;
      }
    } else current.urls.push(t);
  }
  return transfers.filter((transfer) => transfer.urls.length);
}

const WEB_PARAMETERS = [["uri", 2, "uri"], ["url", 3, "uri"], ["method", 2, "method"], ["custommethod", 2, "method"], ["cm", 2, "method"], ["body", 1, "body"], ["infile", 2, "infile"]];

function webParameter(text) {
  const m = /^-([A-Za-z]+)(?::([\s\S]*))?$/.exec(text);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const found = WEB_PARAMETERS.find(([full, least]) => name.length >= least && full.startsWith(name));
  return found ? { name: found[2], attached: m[2] } : { name: null, attached: m[2] };
}

function webRequest(args) {
  const request = { urls: [], method: null, data: [], files: [], get: false, upload: false, unread: false, defaultMethod: "GET" };
  for (let k = 0; k < args.length; k++) {
    const parameter = webParameter(args[k].text);
    if (parameter === null || parameter.name === null) {
      if (parameter === null) request.urls.push(args[k].text);
      continue;
    }
    const token = parameter.attached !== undefined && parameter.attached !== "" ? { text: parameter.attached, quoted: true } : args[k + 1];
    if (parameter.attached === undefined || parameter.attached === "") k++;
    if (parameter.name === "uri") request.urls.push(token?.text ?? "");
    else if (parameter.name === "method") request.method = (token?.text ?? "").toUpperCase();
    else if (parameter.name === "body") {
      if (token?.quoted && !/^\$/.test(token.text)) request.data.push(token.text);
      else request.unread = true;
      request.body = true;
    } else if (parameter.name === "infile") {
      if (token && !/^\$/.test(token.text)) request.files.push(token.text);
      else request.unread = true;
      request.body = true;
    }
  }
  return request;
}

function changes(request) {
  if (request.method) return !["GET", "HEAD"].includes(request.method);
  if (request.defaultMethod === "GET") return false;
  return request.upload || ((request.data.length > 0 || Boolean(request.body)) && !request.get);
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

function localPath(file) {
  if (file === "~" || file.startsWith("~/")) return path.join(os.homedir(), file.slice(1));
  const msys = process.platform === "win32" ? /^\/([a-zA-Z])(\/.*|)$/.exec(file) : null;
  return msys ? `${msys[1]}:${msys[2] || "/"}` : file;
}

function readBodyFiles(file, cwds) {
  const local = localPath(file);
  const places = path.isAbsolute(local) ? [path.resolve(local)] : cwds.filter((cwd) => cwd !== null).map((cwd) => path.resolve(cwd, local));
  const texts = [];
  for (const place of new Set(places)) {
    try {
      texts.push(readFileSync(place, "utf8"));
    } catch {
    }
  }
  return texts;
}

const CHANGES_DIRECTORY = new Set(["cd", "chdir", "set-location", "sl"]);
const PUSHES_DIRECTORY = new Set(["pushd", "push-location"]);
const POPS_DIRECTORY = new Set(["popd", "pop-location"]);

function moveTo(cwd, args) {
  const rest = args.filter((a) => !/^-(?:LiteralPath|Path)$/i.test(a.text) && a.text !== "--");
  const target = rest[0]?.text;
  if (rest.length !== 1 || !target || target === "-" || /^[+-]\d+$/.test(target) || /[$`*?]/.test(target)) return null;
  const local = localPath(target);
  if (path.isAbsolute(local)) return path.resolve(local);
  return cwd === null ? null : path.resolve(cwd, local);
}

const union = (...lists) => [...new Set(lists.flat())];

function nextDirectory(seg, positions, place) {
  const at = [...positions].find((k) => k < seg.length && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(seg[k].text));
  const name = at === undefined ? null : baseName(seg[at]);
  const args = at === undefined ? [] : seg.slice(at + 1);
  const moved = () => union(place.cwds, place.cwds.map((cwd) => moveTo(cwd, args)));
  if (CHANGES_DIRECTORY.has(name)) return { cwds: moved(), stack: place.stack };
  if (PUSHES_DIRECTORY.has(name)) return { cwds: moved(), stack: [...place.stack, place.cwds] };
  if (POPS_DIRECTORY.has(name)) return args.length || !place.stack.length ? { cwds: union(place.cwds, [null]), stack: [] } : { cwds: union(place.cwds, place.stack.at(-1)), stack: place.stack.slice(0, -1) };
  return place;
}

function transportValues(text) {
  const trimmed = text.trim();
  try {
    const data = JSON.parse(trimmed);
    if (data && typeof data === "object" && !Array.isArray(data)) return { texts: ["body", "title"].map((key) => data[key]).filter((value) => typeof value === "string"), raw: [] };
  } catch {
  }
  if (/^[\w.[\]-]+=[^&]*(?:&[\w.[\]-]+=[^&]*)*$/.test(trimmed)) {
    const form = new URLSearchParams(trimmed);
    return { texts: ["body", "title"].flatMap((key) => form.getAll(key)), raw: [] };
  }
  return { texts: [], raw: [text] };
}

function oneRepo(urls) {
  const repos = [...new Set(urls.map(endpointRepo).filter(Boolean).map(normalizeRepo))];
  return repos.length === 1 && urls.every((url) => endpointRepo(url)) ? repos[0] : null;
}

function publishedText(seg, i, command, cwds) {
  const base = baseName(seg[i]);
  const args = seg.slice(i + 1);
  if (base === "curl" || WEB_REQUEST.has(base)) {
    const requests = base === "curl" ? curlTransfers(args) : [webRequest(args)];
    return requests
      .map((request) => ({ ...request, urls: request.urls.filter(githubUrl) }))
      .filter((request) => request.urls.length && changes(request))
      .map((request) => {
        const texts = [];
        const raw = [];
        let whole = request.unread === true;
        const scan = (payload) => {
          const values = transportValues(payload);
          texts.push(...values.texts);
          raw.push(...values.raw);
        };
        const entries = request.data.map((entry) => (typeof entry === "string" ? { kind: "body", value: entry } : entry));
        const isFile = (entry) => base === "curl" && entry.kind !== "raw" && entry.kind !== "form" && entry.value.startsWith("@");
        if (entries.some((entry) => isFile(entry) && entry.value === "@-")) whole = true;
        const places = entries.some((entry) => isFile(entry) && entry.value !== "@-") ? cwds : [null];
        let assembled = false;
        for (const cwd of places) {
          const resolved = entries.map((entry) => (!isFile(entry) ? entry.value : entry.value === "@-" ? "" : (readBodyFiles(entry.value.slice(1), [cwd])[0] ?? null)));
          if (resolved.some((value) => value === null)) continue;
          assembled = true;
          const json = [];
          const data = [];
          entries.forEach((entry, k) => {
            if (entry.kind === "json") json.push(resolved[k]);
            else if (entry.kind === "data" || entry.kind === "raw") data.push(resolved[k]);
            else scan(resolved[k]);
          });
          if (json.length) scan(json.join(""));
          if (data.length) scan(data.join("&"));
        }
        if (!assembled) whole = true;
        for (const name of request.files ?? []) {
          const found = readBodyFiles(name, cwds);
          if (!found.length) whole = true;
          found.forEach(scan);
        }
        return { texts, raw: [...raw, ...(whole ? [command] : [])], destination: oneRepo(request.urls) };
      });
  }
  const texts = [];
  const raw = [];
  let whole = false;
  let destination = null;
  const file = (name, decode) => {
    if (name === "-" || name === "@-" || name === "") {
      whole = true;
      return;
    }
    const found = readBodyFiles(name.replace(/^@/, ""), cwds);
    if (!found.length) whole = true;
    for (const text of found) {
      if (!decode) texts.push(text);
      else {
        const values = transportValues(text);
        texts.push(...values.texts);
        raw.push(...values.raw);
      }
    }
  };
  if (base === "gh") {
    const parsed = ghParse(args);
    const [group, action, selector] = parsed.positional.map((p, k) => (k < 2 ? p.toLowerCase() : p));
    if (PUBLISHING[group]?.has(action)) {
      const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+\/[^/\s]+)\/(?:issues|pull)\/\d+/i.exec(selector ?? "");
      destination = url?.[1] ?? parsed.values("-R", "--repo").at(-1) ?? envRepo(seg, i);
      texts.push(...parsed.values(...TEXT_FLAGS));
      for (const name of parsed.values(...FILE_FLAGS)) file(name, false);
    } else if (group === "api") {
      destination = endpointRepo(parsed.positional[1] ?? "");
      for (const [name, value] of parsed.flags) {
        if (GH_API_FIELD_FLAGS.has(name)) {
          const m = /^(body|title)=([\s\S]*)$/.exec(value);
          if (!m) continue;
          if (name !== "-f" && name !== "--raw-field" && m[2].startsWith("@")) file(m[2], false);
          else texts.push(m[2]);
        } else if (name === "--input") file(value, true);
      }
    } else return [];
  } else return [];
  return [{ texts, raw: [...raw, ...(whole ? [command] : [])], destination }];
}

function unquoted(text, quotes) {
  const prose = text
    .replace(/^ {0,3}(```|~~~)[\s\S]*?^ {0,3}\1[^\n]*$/gm, " ")
    .replace(/`[^`\n]*`/g, " ")
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");
  if (!quotes) return prose;
  return prose
    .replace(/"[^"\n]*"/g, " ")
    .replace(/“[^”\n]*”/g, " ");
}

const VERBS = "decided|decides|approved|approves|agreed|agrees|chose|chosen|chooses|accepted|accepts|confirmed|confirms|signed\\s+off|okayed";
const HEDGE = /\b(not|never|no|yet|whether|if|to|should|would|will|may|might|can|could|must|once|until|unless|before)\b|n['’]t\b/i;

export function decisionClaim(text, login, { quotes = true } = {}) {
  const who = `(?:maintainer|${login.replace(/[-]/g, "\\-")})`;
  const plain = unquoted(text, quotes);
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

export function citedRequests(text, repos = readRepos(), destination = ticketsRepo(repos)) {
  const repo = ticketsRepo(repos);
  const [owner, name] = repo.split("/").map((part) => part.replace(/[.-]/g, (c) => `\\${c}`));
  const prefix = repos.autolinkPrefix.replace(/-/g, "\\-");
  const patterns = [
    new RegExp(`(?<![\\w./-])${prefix}([1-9]\\d*)\\b`, "g"),
    new RegExp(`(?<![\\w./-])${owner}/${name}#([1-9]\\d*)\\b`, "gi"),
    new RegExp(`(?<![\\w.-])(?:https?://)?(?:www\\.)?github\\.com/${owner}/${name}/issues/([1-9]\\d*)\\b`, "gi"),
  ];
  if (sameRepo(destination, repo)) patterns.push(/(?<![\w/&.-])#([1-9]\d*)\b/g);
  return [...new Set(patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((m) => Number(m[1]))))];
}

function claimReason(published, repos, env) {
  if (!published) return null;
  const login = repos.maintainer.login;
  const claim = [...published.texts.map((text) => decisionClaim(text, login)), ...published.raw.map((text) => decisionClaim(text, login, { quotes: false }))].find(Boolean);
  if (!claim) return null;
  const cited = [...new Set([...published.texts, ...published.raw].flatMap((text) => citedRequests(text, repos, published.destination)))];
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
  const start = context.place ?? { cwds: [context.cwd === undefined ? process.cwd() : context.cwd], stack: [] };
  let visited = start.cwds;
  for (let walk = start, k = 0; k < segments.length; k++) {
    walk = nextDirectory(segments[k].tokens, segments[k].positions, walk);
    visited = union(visited, walk.cwds);
  }
  for (const sub of subs) {
    const inner = decideAt(sub, shell, depth + 1, { ...context, place: { cwds: visited, stack: [] } });
    if (inner) return inner;
  }
  let place = start;
  for (const { tokens: seg, positions } of segments) {
    place = nextDirectory(seg, positions, place);
    const cwds = place.cwds;
    for (let i = 0; i < seg.length; i++) {
      const tok = seg[i];
      if (tok.quoted && isShellCommandString(seg, i, positions)) {
        const program = programBefore(seg, i - 1);
        const innerShell = program >= 0 && /^(pwsh|powershell)$/.test(baseName(seg[program])) ? "powershell" : program >= 0 ? "bash" : shell;
        const inner = decideAt(tok.text, innerShell, depth + 1, { ...context, place });
        if (inner) return inner;
      }
      if (!positions.has(i) || !["gh", "curl", "invoke-restmethod", "irm", "invoke-webrequest", "iwr"].includes(baseName(tok))) continue;
      const touched = touches(seg, i, context.repo);
      if (touched) {
        try {
          const index = openRequestIndex(context.repo, context.env);
          const number = touched.numbers.find((n) => index.entry(n));
          if (number !== undefined) return touchReason({ number, action: touched.action }, context.repo);
        } catch (error) {
          if (error instanceof RequestIndexUnreadable) return indexFailure(error.message);
          throw error;
        }
      }
      for (const published of publishedText(seg, i, command, cwds)) {
        const claim = claimReason(published, context.repos, context.env);
        if (claim) return claim;
      }
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

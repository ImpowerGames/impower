import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// resolve-issue branches are <type>/<issue>-<slug>; the session title is
// derived from that branch so no agent has to compose it.
const BRANCH = /^(fix|feat|perf|docs|test|refactor|ci)\/(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const SHELLS = new Set(["bash", "powershell"]);
const RENAME = /(?:^|__)set_(?:session|thread)_title$/i;
const self = fileURLToPath(import.meta.url);

// Splits Bash or PowerShell text into simple commands of words. Quoted text
// stays inside its word, and a `#` starting a word comments out the rest of
// the line, so separators and keywords only count where the shell runs them.
// A backslash (Bash) or backtick (PowerShell) escapes only a quote,
// whitespace, separator or escape character, which keeps Windows paths such
// as C:\work intact.
const ESCAPABLE = /["'`\s;&|()\\#]/;
export function simpleCommands(text) {
  const commands = [];
  let words = [], word = "", inWord = false, quote = null;
  const endWord = () => { if (inWord) words.push(word); word = ""; inWord = false; };
  const endCommand = () => { endWord(); if (words.length) commands.push(words); words = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const escaped = (c === "\\" || c === "`") && i + 1 < text.length && ESCAPABLE.test(text[i + 1]);
    if (quote) {
      if (c === quote) quote = null;
      else if (escaped && quote === '"' && /["\\`]/.test(text[i + 1])) word += text[++i];
      else word += c;
    } else if (c === "'" || c === '"') { quote = c; inWord = true; }
    else if (escaped) { word += text[++i]; inWord = true; }
    else if (c === "#" && !inWord) { while (i + 1 < text.length && !/[\r\n]/.test(text[i + 1])) i++; }
    else if (/[;&|\r\n()]/.test(c)) endCommand();
    else if (/\s/.test(c)) endWord();
    else { word += c; inWord = true; }
  }
  endCommand();
  return commands;
}

const LEADING = new Set(["then", "do", "else", "elif", "{", "!"]);

// Returns the branch and target path of a `git worktree add -b` command.
export function deriveWorktree(command) {
  for (let words of simpleCommands(String(command))) {
    while (LEADING.has(words[0])) words = words.slice(1);
    if (words[0] !== "git" || words[1] !== "worktree" || words[2] !== "add") continue;
    let branch = null, target = null;
    for (let i = 3; i < words.length; i++) {
      const word = words[i];
      if (word === "-b" || word === "-B") branch = words[++i];
      else if (word === "--reason") i++;
      else if (word.startsWith("-")) continue;
      else if (target === null) target = word;
    }
    const parts = branch?.match(BRANCH);
    if (parts && target) return { branch, target, title: `${parts[1].toUpperCase()} #${parts[2]}: ${parts[3].replaceAll("-", " ")}` };
  }
  return null;
}

export const deriveTitle = (command) => deriveWorktree(command)?.title ?? null;

// Real paths expand Windows 8.3 short names and symbolic links, which Git
// reports in their long form; a path that does not exist matches nothing.
const realPath = (p) => { try { return fs.realpathSync.native(path.resolve(p)); } catch { return null; } };
const samePath = (a, b) => {
  const [x, y] = [realPath(a), realPath(b)];
  if (x === null || y === null) return false;
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
};

// Codex runs PostToolUse after failed commands too and reports only their
// output, so the title is recorded only once Git lists a worktree at the
// command's target path on its branch.
export function worktreeCreated(cwd, { branch, target }) {
  let list;
  try {
    list = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
  } catch {
    return false;
  }
  const wanted = path.resolve(cwd, target);
  return list.split(/\r?\n\r?\n/).some((entry) => {
    const lines = entry.split(/\r?\n/);
    const at = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    return at !== undefined && samePath(at, wanted) && lines.includes(`branch refs/heads/${branch}`);
  });
}

// Private per-session state outside any checkout, so concurrent sessions in
// different worktrees never see each other's pending title. The key is a hash
// of the complete session id, which may contain any characters; it also names
// the session in the acknowledgement command without shell syntax.
export const sessionKey = (sessionId) => createHash("sha256").update(String(sessionId)).digest("hex");
const stateDir = () => process.env.IMPOWER_SESSION_TITLE_DIR || path.join(os.tmpdir(), "impower-session-titles");
const keyPath = (key) => path.join(stateDir(), key + ".json");
export const statePath = (sessionId) => keyPath(sessionKey(sessionId));

function sessionOf(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Expected a tool event object");
  if (typeof payload.session_id !== "string" || !payload.session_id) throw new Error("Tool event is missing session_id");
  return payload.session_id;
}

// Writers that run as subagents of one session share its id, so the record
// holds one pending entry { id, title, worktree } per worktree, and each is
// gated, renamed and acknowledged on its own.
const canonical = (p) => {
  const slashed = (realPath(p) ?? path.resolve(p)).replaceAll("\\", "/").replace(/\/+$/, "");
  return process.platform === "win32" ? slashed.toLowerCase() : slashed;
};
export const worktreeId = (worktree) => createHash("sha256").update(canonical(worktree)).digest("hex").slice(0, 16);

function pending(sessionId) {
  try {
    const state = JSON.parse(fs.readFileSync(statePath(sessionId), "utf8"));
    return state.sessionId === sessionId && Array.isArray(state.entries) ? state.entries : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Sibling writers' hooks are separate processes that update one record, so each
// read-modify-write holds an exclusive lock file beside it. A lock older than
// STALE_LOCK_MS belongs to a hook that died and is taken over. The record is
// replaced by renaming a complete file, so an unlocked reader never sees a
// partial write. `change` receives the session's entries and returns
// { entries, value }.
const STALE_LOCK_MS = 10000;
function modify(file, sessionId, change) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = file + ".lock";
  for (const giveUp = Date.now() + 3 * STALE_LOCK_MS; ;) {
    try { fs.closeSync(fs.openSync(lock, "wx")); break; }
    catch (error) {
      if (!["EEXIST", "EPERM", "EACCES"].includes(error.code)) throw error;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > STALE_LOCK_MS) fs.rmSync(lock, { force: true }); } catch { /* released meanwhile */ }
      if (Date.now() > giveUp) throw new Error(`Session title record is locked: ${lock}`);
      pause(20);
    }
  }
  try {
    let state = null;
    try { state = JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const owner = sessionId ?? state?.sessionId;
    const { entries, value } = change(state?.sessionId === owner && Array.isArray(state.entries) ? state.entries : [], owner);
    if (!entries.length) fs.rmSync(file, { force: true });
    else {
      const next = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(next, JSON.stringify({ sessionId: owner, entries }));
      fs.renameSync(next, file);
    }
    return value;
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

export const ackCommand = (sessionId, worktree) => `node "${self.replaceAll("\\", "/")}" confirm ${sessionKey(sessionId)} ${worktreeId(worktree)}`;

function instruction(entry, sessionId, harness) {
  const { title } = entry;
  const call = harness === "claude"
    ? `Load the set_session_title tool through tool search (its full name ends in __set_session_title), then call it with session_id "self" and title "${title}".`
    : `Call set_thread_title with title "${title}" when the host offers it.`;
  return `This session creates the worktree for "${title}" at ${entry.worktree}. Rename the session to exactly that title before running further shell commands in that worktree. ${call} Only if this runner offers no rename tool, run \`${ackCommand(sessionId, entry.worktree)}\` instead.`;
}

// PostToolUse: record the title after worktree creation; clear it after the rename.
export function afterTool(payload, harness) {
  const sessionId = sessionOf(payload);
  const tool = String(payload.tool_name ?? "");
  if (SHELLS.has(tool.toLowerCase())) {
    const cwd = payload.cwd || process.cwd();
    const created = deriveWorktree(payload.tool_input?.command ?? "");
    if (!created || !worktreeCreated(cwd, created)) return null;
    const worktree = path.resolve(cwd, created.target);
    const entry = { id: worktreeId(worktree), title: created.title, worktree };
    modify(statePath(sessionId), sessionId, (entries) => ({ entries: [...entries.filter((other) => other.id !== entry.id), entry] }));
    return instruction(entry, sessionId, harness);
  }
  if (RENAME.test(tool)) {
    return modify(statePath(sessionId), sessionId, (entries) => {
      if (!entries.length) return { entries };
      // A rename issued from inside one pending worktree can acknowledge only that worktree's title.
      const from = payload.cwd ? entries.find((entry) => touches(entry, { cwd: payload.cwd })) : undefined;
      const match = entries.find((entry) => entry.title === payload.tool_input?.title && (!from || entry === from));
      // A rename aimed at another session does not rename this one.
      const target = payload.tool_input?.session_id;
      if (!match || (target !== undefined && target !== "self" && target !== sessionId)) {
        const entry = match ?? from ?? entries[0];
        return { entries, value: `The session title must be exactly "${entry.title}". ${instruction(entry, sessionId, harness)}` };
      }
      return { entries: entries.filter((entry) => entry !== match) };
    }) ?? null;
  }
  return null;
}

// Whether the command runs in, or names, the entry's worktree.
function touches(entry, payload) {
  const worktree = canonical(entry.worktree);
  const within = (p) => { const c = canonical(p); return c === worktree || c.startsWith(worktree + "/"); };
  if (payload.cwd && within(payload.cwd)) return true;
  // A path operand may spell the worktree differently (relative, with parent
  // segments, or by its Windows 8.3 name), so each word is resolved from the
  // working directory and compared by real path.
  const base = payload.cwd || process.cwd();
  for (const words of simpleCommands(String(payload.tool_input?.command ?? "")))
    for (const word of words.slice(0, 64)) {
      if (!word || word.length > 1024 || /[\0\r\n]/.test(word) || realPath(path.resolve(base, word)) === null) continue;
      if (within(path.resolve(base, word))) return true;
    }
  let command = String(payload.tool_input?.command ?? "").replaceAll("\\", "/");
  if (process.platform === "win32") command = command.toLowerCase();
  for (let at = command.indexOf(worktree); at >= 0; at = command.indexOf(worktree, at + 1)) {
    const next = command[at + worktree.length];
    if (next === undefined || /[\s/"';&|)]/.test(next)) return true;
  }
  return false;
}

// PreToolUse: deny shell commands in a worktree whose derived title is unconfirmed.
export function gate(payload, harness) {
  const tool = String(payload?.tool_name ?? "").toLowerCase();
  if (!SHELLS.has(tool)) return null;
  const sessionId = sessionOf(payload);
  const entry = pending(sessionId).find((candidate) => touches(candidate, payload));
  if (!entry) return null;
  return isAck(payload.tool_input?.command, sessionId, entry) ? null : instruction(entry, sessionId, harness);
}

// The only command let through is this script's own confirm for this session and worktree.
function isAck(command, sessionId, entry) {
  const match = String(command ?? "").trim().match(/^node\s+(?:"([^"]+)"|([^\s"';&|]+))\s+confirm\s+([0-9a-f]{64})\s+([0-9a-f]{16})$/);
  return Boolean(match) && match[3] === sessionKey(sessionId) && match[4] === entry.id && samePath(match[1] ?? match[2], self);
}

async function readEvent() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return JSON.parse(raw);
}

export async function main(event, harness) {
  if (!["claude", "codex"].includes(harness)) throw new Error("Supply the hook adapter: claude or codex");
  const payload = await readEvent();
  if (event === "pre") {
    const reason = gate(payload, harness);
    if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
  } else if (event === "post") {
    const context = afterTool(payload, harness);
    if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context } }));
  } else throw new Error("Supply the hook event: pre or post");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase()) {
  const [command, key, id] = process.argv.slice(2);
  if (command !== "confirm" || !/^[0-9a-f]{64}$/.test(key ?? "") || !/^[0-9a-f]{16}$/.test(id ?? "")) {
    console.error("Usage: node session-title.mjs confirm <session key> <worktree id, both from the hook message>");
    process.exitCode = 2;
  } else {
    const file = keyPath(key);
    const match = fs.existsSync(file) ? modify(file, null, (entries) => {
      const found = entries.find((entry) => entry.id === id);
      return { entries: found ? entries.filter((entry) => entry !== found) : entries, value: found };
    }) : undefined;
    if (!match) {
      console.error(`No pending session title for ${key} ${id}.`);
      process.exitCode = 1;
    } else console.log(`Session title "${match.title}" acknowledged.`);
  }
}

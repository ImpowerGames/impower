import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BRANCH = /^(fix|feat|perf|docs|test|refactor|ci)\/(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const SHELLS = new Set(["bash", "powershell"]);
const RENAME = /(?:^|__)set_(?:session|thread)_title$/i;
const self = fileURLToPath(import.meta.url);

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

const RECORD_WRITERS = [["issue-run.mjs", "init"], ["checkpoint.mjs", "resume"]];
export function deriveRunRecord(command) {
  for (let words of simpleCommands(String(command))) {
    while (LEADING.has(words[0])) words = words.slice(1);
    if (!/^node(?:\.exe)?$/i.test(path.basename(words[0] ?? ""))) continue;
    const script = words[1]?.replaceAll("\\", "/") ?? "";
    if (!RECORD_WRITERS.some(([file, sub]) => script.endsWith(`orchestrate-issues/${file}`) && words[2] === sub)) continue;
    const at = words.indexOf("--record");
    if (at > 0 && words[at + 1]) return words[at + 1];
  }
  return null;
}
const ORCH_TITLE = /^ORCH #\d+: [a-z0-9]+(?: [a-z0-9]+){1,3}$/;
function recordTitle(cwd, record) {
  try {
    const title = JSON.parse(fs.readFileSync(path.resolve(cwd, record), "utf8"))?.title;
    return typeof title === "string" && ORCH_TITLE.test(title) ? title : null;
  } catch { return null; }
}
const titleId = (title) => createHash("sha256").update(`session-title:${title}`).digest("hex").slice(0, 16);
const forSession = (entry) => entry.worktree === null;

const realPath = (p) => { try { return fs.realpathSync.native(path.resolve(p)); } catch { return null; } };
const samePath = (a, b) => {
  const [x, y] = [realPath(a), realPath(b)];
  if (x === null || y === null) return false;
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
};

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

export const sessionKey = (sessionId) => createHash("sha256").update(String(sessionId)).digest("hex");
const stateDir = () => process.env.IMPOWER_SESSION_TITLE_DIR || path.join(os.tmpdir(), "impower-session-titles");
const keyPath = (key) => path.join(stateDir(), key + ".json");
export const statePath = (sessionId) => keyPath(sessionKey(sessionId));

function sessionOf(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Expected a tool event object");
  if (typeof payload.session_id !== "string" || !payload.session_id) throw new Error("Tool event is missing session_id");
  return payload.session_id;
}

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

const STALE_LOCK_MS = 10000;
function modify(file, sessionId, change) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = file + ".lock";
  for (const giveUp = Date.now() + 3 * STALE_LOCK_MS; ;) {
    try { fs.closeSync(fs.openSync(lock, "wx")); break; }
    catch (error) {
      if (!["EEXIST", "EPERM", "EACCES"].includes(error.code)) throw error;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > STALE_LOCK_MS) fs.rmSync(lock, { force: true }); } catch {}
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

const ackFor = (sessionId, id) => `node "${self.replaceAll("\\", "/")}" confirm ${sessionKey(sessionId)} ${id}`;
export const ackCommand = (sessionId, worktree) => ackFor(sessionId, worktreeId(worktree));

function instruction(entry, sessionId, harness) {
  const { title } = entry;
  const call = harness === "claude"
    ? `Load the set_session_title tool through tool search (its full name ends in __set_session_title), then call it with session_id "self" and title "${title}".`
    : `Call set_thread_title with title "${title}" when the host offers it.`;
  const what = forSession(entry)
    ? `This session coordinates a parent issue as "${title}", the title its run record holds. Rename the session to exactly that title before running further shell commands.`
    : `This session creates the worktree for "${title}" at ${entry.worktree}. Rename the session to exactly that title before running further shell commands in that worktree.`;
  return `${what} ${call} If the rename tool is unavailable or refuses (including for a subagent writer), run \`${ackFor(sessionId, entry.id)}\` instead.`;
}

const settle = (entries, done) => (forSession(done) ? entries.map((entry) => (entry === done ? { ...entry, acknowledged: true } : entry)) : entries.filter((entry) => entry !== done));
const open = (entries) => entries.filter((entry) => !entry.acknowledged);

export function afterTool(payload, harness) {
  const sessionId = sessionOf(payload);
  const tool = String(payload.tool_name ?? "");
  if (SHELLS.has(tool.toLowerCase())) {
    const cwd = payload.cwd || process.cwd();
    const command = payload.tool_input?.command ?? "";
    const record = deriveRunRecord(command);
    const title = record && recordTitle(cwd, record);
    if (title) {
      const entry = { id: titleId(title), title, worktree: null };
      const asked = modify(statePath(sessionId), sessionId, (entries) => (entries.some((other) => other.id === entry.id) ? { entries, value: !entries.find((other) => other.id === entry.id).acknowledged } : { entries: [...entries, entry], value: true }));
      return asked ? instruction(entry, sessionId, harness) : null;
    }
    const created = deriveWorktree(command);
    if (!created || !worktreeCreated(cwd, created)) return null;
    const worktree = path.resolve(cwd, created.target);
    const entry = { id: worktreeId(worktree), title: created.title, worktree };
    modify(statePath(sessionId), sessionId, (entries) => ({ entries: [...entries.filter((other) => other.id !== entry.id), entry] }));
    return instruction(entry, sessionId, harness);
  }
  if (RENAME.test(tool)) {
    return modify(statePath(sessionId), sessionId, (stored) => {
      const target = payload.tool_input?.session_id;
      const self = target === undefined || target === "self" || target === sessionId;
      const entries = self ? stored.filter((entry) => !(entry.acknowledged && entry.title !== payload.tool_input?.title)) : stored;
      const pendingEntries = open(entries);
      if (!pendingEntries.length) return { entries };
      const from = payload.cwd ? pendingEntries.find((entry) => !forSession(entry) && touches(entry, { cwd: payload.cwd })) : undefined;
      const match = pendingEntries.find((entry) => entry.title === payload.tool_input?.title && (forSession(entry) || !from || entry === from));
      if (!match || !self) {
        const entry = match ?? from ?? pendingEntries[0];
        return { entries, value: `The session title must be exactly "${entry.title}". ${instruction(entry, sessionId, harness)}` };
      }
      return { entries: settle(entries, match) };
    }) ?? null;
  }
  return null;
}

function touches(entry, payload) {
  if (forSession(entry)) return true;
  const worktree = canonical(entry.worktree);
  const within = (p) => { const c = canonical(p); return c === worktree || c.startsWith(worktree + "/"); };
  if (payload.cwd && within(payload.cwd)) return true;
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

export function gate(payload, harness) {
  const tool = String(payload?.tool_name ?? "").toLowerCase();
  if (!SHELLS.has(tool)) return null;
  const sessionId = sessionOf(payload);
  const entry = open(pending(sessionId)).find((candidate) => touches(candidate, payload));
  if (!entry) return null;
  return isAck(payload.tool_input?.command, sessionId, entry, tool) ? null : instruction(entry, sessionId, harness);
}

function isAck(command, sessionId, entry, tool) {
  const quoted = /(?:'[^'\r\n]*'|"[^"$`\\\r\n]*")/.source;
  const value = tool === "powershell" ? quoted : `(?:${quoted}|[a-zA-Z0-9_./:-]+)`;
  const assignment = tool === "powershell"
    ? new RegExp(`^\\$env:[a-zA-Z_][a-zA-Z0-9_]*[ \\t]*=[ \\t]*${value}[ \\t]*;[ \\t]*`, "i")
    : new RegExp(`^[a-zA-Z_][a-zA-Z0-9_]*=${value}[ \\t]+`);
  let text = String(command ?? "").trim();
  for (let prefix; (prefix = text.match(assignment)); ) text = text.slice(prefix[0].length);
  const match = text.match(/^node\s+(?:"([^"]+)"|([^\s"';&|]+))\s+confirm\s+([0-9a-f]{64})\s+([0-9a-f]{16})$/);
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
      const found = open(entries).find((entry) => entry.id === id);
      return { entries: found ? settle(entries, found) : entries, value: found };
    }) : undefined;
    if (!match) {
      console.error(`No pending session title for ${key} ${id}.`);
      process.exitCode = 1;
    } else console.log(`Session title "${match.title}" acknowledged.`);
  }
}

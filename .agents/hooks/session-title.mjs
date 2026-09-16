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

// Splits shell text into simple commands of words. Quoted text stays inside
// its word, so separators and keywords only count outside quotes. A backslash
// escapes only a quote, whitespace or separator, which keeps PowerShell and
// Windows paths such as C:\work intact.
const ESCAPABLE = /["'\s;&|()\\]/;
export function simpleCommands(text) {
  const commands = [];
  let words = [], word = "", inWord = false, quote = null;
  const endWord = () => { if (inWord) words.push(word); word = ""; inWord = false; };
  const endCommand = () => { endWord(); if (words.length) commands.push(words); words = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const escaped = c === "\\" && i + 1 < text.length && ESCAPABLE.test(text[i + 1]);
    if (quote) {
      if (c === quote) quote = null;
      else if (escaped && quote === '"' && /["\\]/.test(text[i + 1])) word += text[++i];
      else word += c;
    } else if (c === "'" || c === '"') { quote = c; inWord = true; }
    else if (escaped) { word += text[++i]; inWord = true; }
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

const samePath = (a, b) => {
  const [x, y] = [path.resolve(a), path.resolve(b)];
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

function pending(sessionId) {
  try {
    const state = JSON.parse(fs.readFileSync(statePath(sessionId), "utf8"));
    return state.sessionId === sessionId ? state.title ?? null : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export const ackCommand = (sessionId) => `node "${self.replaceAll("\\", "/")}" confirm ${sessionKey(sessionId)}`;

function instruction(title, sessionId, harness) {
  const call = harness === "claude"
    ? `Load the set_session_title tool through tool search (its full name ends in __set_session_title), then call it with session_id "self" and title "${title}".`
    : `Call set_thread_title with title "${title}" when the host offers it.`;
  return `This session creates the worktree for "${title}". Rename the session to exactly that title before running further shell commands. ${call} Only if this runner offers no rename tool, run \`${ackCommand(sessionId)}\` instead.`;
}

// PostToolUse: record the title after worktree creation; clear it after the rename.
export function afterTool(payload, harness) {
  const sessionId = sessionOf(payload);
  const tool = String(payload.tool_name ?? "");
  if (SHELLS.has(tool.toLowerCase())) {
    const created = deriveWorktree(payload.tool_input?.command ?? "");
    if (!created || !worktreeCreated(payload.cwd || process.cwd(), created)) return null;
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(statePath(sessionId), JSON.stringify({ sessionId, title: created.title }));
    return instruction(created.title, sessionId, harness);
  }
  if (RENAME.test(tool)) {
    const title = pending(sessionId);
    if (!title) return null;
    // A rename aimed at another session does not rename this one.
    const target = payload.tool_input?.session_id;
    if (payload.tool_input?.title !== title || (target !== undefined && target !== "self" && target !== sessionId)) return `The session title must be exactly "${title}". ${instruction(title, sessionId, harness)}`;
    fs.rmSync(statePath(sessionId), { force: true });
  }
  return null;
}

// PreToolUse: deny shell commands while a derived title is unconfirmed.
export function gate(payload, harness) {
  const tool = String(payload?.tool_name ?? "").toLowerCase();
  if (!SHELLS.has(tool)) return null;
  const sessionId = sessionOf(payload);
  const title = pending(sessionId);
  if (!title) return null;
  return isAck(payload.tool_input?.command, sessionId) ? null : instruction(title, sessionId, harness);
}

// The only command let through is this script's own confirm for this session.
function isAck(command, sessionId) {
  const match = String(command ?? "").trim().match(/^node\s+(?:"([^"]+)"|([^\s"';&|]+))\s+confirm\s+([0-9a-f]{64})$/);
  return Boolean(match) && match[3] === sessionKey(sessionId) && samePath(match[1] ?? match[2], self);
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
  const [command, key] = process.argv.slice(2);
  if (command !== "confirm" || !/^[0-9a-f]{64}$/.test(key ?? "")) {
    console.error("Usage: node session-title.mjs confirm <session key from the hook message>");
    process.exitCode = 2;
  } else if (!fs.existsSync(keyPath(key))) {
    console.error(`No pending session title for ${key}.`);
    process.exitCode = 1;
  } else {
    fs.rmSync(keyPath(key), { force: true });
    console.log(`Session title acknowledged for ${key}.`);
  }
}

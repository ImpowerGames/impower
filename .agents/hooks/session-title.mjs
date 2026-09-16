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

// Only `git worktree add` at a command position counts; text quoted or echoed
// by another command does not.
export function deriveBranch(command) {
  for (const add of String(command).matchAll(/(?:^|[;&|\r\n(]|\bthen\b|\bdo\b)\s*git\s+worktree\s+add\b([^;&|\r\n]*)/g)) {
    const branch = add[1].match(/(?:^|\s)-[bB]\s+(["']?)([^\s"']+)\1(?=\s|$)/)?.[2];
    const parts = branch?.match(BRANCH);
    if (parts) return { branch, title: `${parts[1].toUpperCase()} #${parts[2]}: ${parts[3].replaceAll("-", " ")}` };
  }
  return null;
}

export const deriveTitle = (command) => deriveBranch(command)?.title ?? null;

// Codex runs PostToolUse after failed commands too and reports only their
// output, so the title is recorded only once Git lists a worktree on the branch.
export function worktreeExists(cwd, branch) {
  try {
    const list = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
    return list.split(/\r?\n/).includes(`branch refs/heads/${branch}`);
  } catch {
    return false;
  }
}

// Private per-session state outside any checkout, so concurrent sessions in
// different worktrees never see each other's pending title. The file name is a
// hash of the complete session id, which may contain any characters.
export function statePath(sessionId) {
  const dir = process.env.IMPOWER_SESSION_TITLE_DIR || path.join(os.tmpdir(), "impower-session-titles");
  return path.join(dir, createHash("sha256").update(String(sessionId)).digest("hex") + ".json");
}

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

export const ackCommand = (sessionId) => `node "${self.replaceAll("\\", "/")}" confirm ${sessionId}`;

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
    const created = deriveBranch(payload.tool_input?.command ?? "");
    if (!created || !worktreeExists(payload.cwd || process.cwd(), created.branch)) return null;
    fs.mkdirSync(path.dirname(statePath(sessionId)), { recursive: true });
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
  const match = String(command ?? "").trim().match(/^node\s+(?:"([^"]+)"|([^\s"]+))\s+confirm\s+(\S+)$/);
  if (!match || match[3] !== sessionId) return false;
  const same = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
  return same(path.resolve(match[1] ?? match[2]), path.resolve(self));
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
  const [command, sessionId] = process.argv.slice(2);
  if (command !== "confirm" || !sessionId) {
    console.error("Usage: node session-title.mjs confirm <session-id>");
    process.exitCode = 2;
  } else if (!pending(sessionId)) {
    console.error(`No pending session title for ${sessionId}.`);
    process.exitCode = 1;
  } else {
    fs.rmSync(statePath(sessionId), { force: true });
    console.log(`Session title acknowledged for ${sessionId}.`);
  }
}

// Where the web editor driver keeps each session's server record and browser
// profile. The driver and clean-worktrees both import this, so a worktree's
// records are found by the same rule that wrote them.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Which agent session is running a command. Every command is its own
// process, so the identity comes from the environment: IMPOWER_DRIVER_SESSION
// when set, otherwise the session variable a known runner exports. Without
// one, every such command shares the "shared" slot.
export const SESSION_VARIABLES = ["IMPOWER_DRIVER_SESSION", "CLAUDE_CODE_SESSION_ID", "CODEX_THREAD_ID"];
export function driverSession(env = process.env) {
  for (const name of SESSION_VARIABLES) if (env[name]) return env[name];
  return null;
}

const shortHash = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);

// The short root outside every checkout (IMPOWER_DRIVER_HOME overrides it).
export const driverHome = (env = process.env) => env.IMPOWER_DRIVER_HOME || path.join(env.LOCALAPPDATA || os.tmpdir(), "impower-driver");

// Every session of one checkout lives under the checkout's own directory.
export const checkoutDir = (root, env = process.env) => path.join(driverHome(env), shortHash(path.resolve(root)));

export function sessionDir({ root, session = driverSession(), env = process.env } = {}) {
  return path.join(checkoutDir(root, env), session ? shortHash(session) : "shared");
}

// The state file of every session that has one for this checkout, whichever
// session is asking; `io` is a parameter so tests can pin it without disk.
export function checkoutStateFiles(root, env = process.env, io = fs) {
  const dir = checkoutDir(root, env);
  let names;
  try {
    names = io.readdirSync(dir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return names.map((name) => path.join(dir, name, "state.json")).filter((file) => io.existsSync(file)).sort();
}

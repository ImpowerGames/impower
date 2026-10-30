import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { systemTemp } from "./worktree-temp.mjs";

export const SESSION_VARIABLES = ["IMPOWER_DRIVER_SESSION", "CLAUDE_CODE_SESSION_ID", "CODEX_THREAD_ID"];
export function driverSession(env = process.env) {
  for (const name of SESSION_VARIABLES) if (env[name]) return env[name];
  return null;
}

const shortHash = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);

export const driverHome = (env = process.env) => env.IMPOWER_DRIVER_HOME || path.join(env.LOCALAPPDATA || systemTemp(env), "impower-driver");

export const checkoutDir = (root, env = process.env) => path.join(driverHome(env), shortHash(path.resolve(root)));

export const CHECKOUT_OWNER_FILE = "checkout.json";
export function recordCheckoutOwner(root, env = process.env) {
  const dir = checkoutDir(root, env);
  fs.mkdirSync(dir, { recursive: true });
  try { fs.writeFileSync(path.join(dir, CHECKOUT_OWNER_FILE), JSON.stringify({ checkout: path.resolve(root) }) + "\n", { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
}

export const PROFILE_CLAIM_MS = 30 * 60_000;
export const PROFILE_CLAIM_FILE = "impower-driver-session.json";
export const PROFILE_LOCK_STALE_MS = 30_000;

export function sessionDir({ root, session = driverSession(), env = process.env } = {}) {
  return path.join(checkoutDir(root, env), session ? shortHash(session) : "shared");
}

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

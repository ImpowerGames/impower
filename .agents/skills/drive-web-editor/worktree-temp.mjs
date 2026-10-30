import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TEMP_VARIABLES = ["TEMP", "TMP", "TMPDIR"];

export const SYSTEM_TEMP_VARIABLE = "IMPOWER_SYSTEM_TMPDIR";

export const checkoutRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function worktreeTempDir(root = checkoutRoot) {
  const dir = path.join(path.resolve(root), ".tmp");
  fs.mkdirSync(dir, { recursive: true });
  try { fs.writeFileSync(path.join(dir, ".gitignore"), "*\n", { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  return dir;
}

export function useWorktreeTemp(root = checkoutRoot, env = process.env) {
  const dir = worktreeTempDir(root);
  if (!env[SYSTEM_TEMP_VARIABLE]) env[SYSTEM_TEMP_VARIABLE] = os.tmpdir();
  for (const name of TEMP_VARIABLES) env[name] = dir;
  const ceilings = (env.GIT_CEILING_DIRECTORIES ?? "").split(path.delimiter).filter(Boolean);
  if (!ceilings.includes(dir)) env.GIT_CEILING_DIRECTORIES = [dir, ...ceilings].join(path.delimiter);
  return dir;
}

export function worktreeTempEnv(root = checkoutRoot, source = process.env) {
  const env = { ...source };
  useWorktreeTemp(root, env);
  return env;
}

export const systemTemp = (env = process.env) => env[SYSTEM_TEMP_VARIABLE] || os.tmpdir();

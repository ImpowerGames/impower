import fs from "node:fs";
import { execFile, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PARALLEL_LIMIT = 16;

export async function runJobs(jobs, { cwd, limit = PARALLEL_LIMIT, exec = execFile } = {}) {
  const results = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      const [cmd, args] = jobs[i];
      results[i] = await new Promise((resolve) => {
        exec(cmd, args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
          resolve(error ? { ok: false, stdout: stdout ?? "", stderr: String(stderr || error.message) } : { ok: true, stdout });
        });
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
}

export function runParallel(jobs, { cwd, limit = PARALLEL_LIMIT } = {}) {
  if (!jobs.length) return [];
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--worker", String(limit)], { cwd, input: JSON.stringify(jobs), encoding: "utf8", windowsHide: true, maxBuffer: 512 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`parallel gh reads failed: ${String(r.stderr).trim().split("\n")[0]}`);
  return JSON.parse(r.stdout);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === "--worker") {
  const jobs = JSON.parse(fs.readFileSync(0, "utf8"));
  runJobs(jobs, { cwd: process.cwd(), limit: Number(process.argv[3]) || PARALLEL_LIMIT }).then((results) => process.stdout.write(JSON.stringify(results)));
}

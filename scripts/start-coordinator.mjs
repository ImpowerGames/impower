import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { spawnDetached } from "./detached-launch.mjs";

const self = fileURLToPath(import.meta.url);
const handoff = path.join(path.dirname(self), "agent-handoff.mjs");

export async function startCoordinator(plan, jobDir, io = { spawn, platform: process.platform }) {
  if (!path.isAbsolute(plan) || !path.isAbsolute(jobDir)) throw new Error("The plan and the job directory must be absolute paths");
  if (!fs.statSync(jobDir).isDirectory()) throw new Error(`${jobDir} is not a directory`);
  const { worktree } = JSON.parse(fs.readFileSync(plan, "utf8"));
  if (typeof worktree !== "string" || !path.isAbsolute(worktree)) throw new Error(`${plan} names no absolute worktree`);
  const name = path.basename(plan, path.extname(plan));
  const stdout = path.join(jobDir, `${name}.coordinator.out.log`);
  const stderr = path.join(jobDir, `${name}.coordinator.err.log`);
  const created = [];
  let out, err, child;
  try {
    out = fs.openSync(stdout, "wx");
    created.push(stdout);
    err = fs.openSync(stderr, "wx");
    created.push(stderr);
    child = spawnDetached(process.execPath, [handoff, plan], { cwd: worktree, stdio: ["ignore", out, err] }, io);
    await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    child.unref();
    return { pid: child.pid, stdout, stderr };
  } catch (error) {
    if (child?.pid === undefined) {
      for (const fd of [out, err]) if (fd !== undefined) fs.closeSync(fd);
      out = err = undefined;
      for (const file of created) fs.rmSync(file, { force: true });
    }
    throw error;
  } finally {
    for (const fd of [out, err]) if (fd !== undefined) fs.closeSync(fd);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === self.toLowerCase()) {
  if (process.argv.length !== 4) {
    console.error("Usage: node scripts/start-coordinator.mjs <absolute-plan.json> <absolute-job-dir>");
    process.exit(2);
  }
  startCoordinator(process.argv[2], process.argv[3]).then(
    (result) => console.log(JSON.stringify(result)),
    (error) => { console.error(`start-coordinator: ${error.message}`); process.exit(1); },
  );
}

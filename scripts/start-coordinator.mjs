// Starts the review coordinator, `node scripts/agent-handoff.mjs <plan>`,
// through spawnDetached and prints the pid of the process at the root of its
// tree. On Windows that is the hidden wrapper in detached-launch.mjs, so the
// coordinator and its reviewer get a hidden console instead of a visible one
// that takes keyboard focus, and the detached wrapper is outside the process
// tree of the command tool call that ran this script, so the coordinator
// outlives that call.
//
//   node scripts/start-coordinator.mjs <absolute-plan.json> <absolute-job-dir>
//
// The coordinator runs in the plan's `worktree`. Its stdout and stderr go to
// `<plan name>.coordinator.out.log` and `.err.log` in the job directory; both
// are created exclusively, so a plan already started from that directory is
// refused before anything spawns.
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
  const out = fs.openSync(stdout, "wx");
  let err, child;
  try {
    err = fs.openSync(stderr, "wx");
    child = spawnDetached(process.execPath, [handoff, plan], { cwd: worktree, stdio: ["ignore", out, err] }, io);
    await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    child.unref();
    return { pid: child.pid, stdout, stderr };
  } catch (error) {
    // Nothing started, so the plan may be started again from this directory.
    if (child?.pid === undefined) for (const file of [stdout, stderr]) fs.rmSync(file, { force: true });
    throw error;
  } finally {
    fs.closeSync(out);
    if (err !== undefined) fs.closeSync(err);
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

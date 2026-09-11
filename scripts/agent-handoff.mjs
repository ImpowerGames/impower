import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const gitHead = (cwd) => execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
const gitStatus = (cwd) => execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });

// Configuration is a local, caller-authored artifact. Comments and child output
// can select a declared transition but can never supply executable commands.
export async function runHandoff(configFile) {
  const config = read(configFile);
  const cwd = fs.realpathSync(config.worktree);
  const journal = path.resolve(config.journal);
  const relative = path.relative(cwd, journal);
  if (!relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) throw new Error("Journal must be outside the worktree");
  if (!config.writer || !config.reviewer || config.writer === config.reviewer) throw new Error("Supply distinct writer and reviewer model routes");
  if (!Number.isInteger(config.maxSteps) || config.maxSteps < 1 || config.maxSteps > 12) throw new Error("maxSteps must be 1..12");
  if (fs.existsSync(journal)) throw new Error("Journal exists; inspect recorded process and completion before authoring a recovery plan");
  for (const step of Object.values(config.steps)) {
    if (!["implement", "review", "adjudicate"].includes(step.role) || !path.isAbsolute(step.executable) || !Array.isArray(step.args) || !step.args.every((a) => typeof a === "string") || !path.isAbsolute(step.prompt)) throw new Error("Each role needs an absolute executable, argument array and prompt file");
    if (!step.model || step.model !== (step.role === "review" ? config.reviewer : config.writer)) throw new Error("Step model must match its caller-supplied role route");
    const explicit = step.args.findIndex((a) => a === "--model" || a === "-m");
    const agent = step.args.indexOf("--agent");
    if (explicit >= 0) {
      if (step.args[explicit + 1] !== step.model) throw new Error("Model argument does not match the declared route");
    } else if (agent >= 0 && /^reviewer-[a-z0-9-]+$/.test(step.args[agent + 1] ?? "")) {
      const definition = fs.readFileSync(path.join(cwd, ".claude", "agents", step.args[agent + 1] + ".md"), "utf8");
      if (/^model:\s*(.+)$/m.exec(definition)?.[1].trim() !== step.model) throw new Error("Agent definition does not match the declared route");
    } else throw new Error("Launch must explicitly select its model or a checked pinned agent definition");
    if (!Array.isArray(step.next) || !step.next.length || !step.next.every((name) => name === null || Object.hasOwn(config.steps, name))) throw new Error("Each step needs declared next transitions");
  }
  fs.mkdirSync(path.dirname(journal), { recursive: true });
  const lock = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "agent-handoff.lock"], { cwd, encoding: "utf8" }).trim();
  const owner = fs.openSync(lock, "wx");
  fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), journal }));
  fs.closeSync(owner);
  const fd = fs.openSync(journal, "wx");
  const append = (row) => { fs.writeSync(fd, JSON.stringify({ time: new Date().toISOString(), ...row }) + "\n"); fs.fsyncSync(fd); };
  let current = config.first;
  let correctiveRounds = 0;
  try {
    for (let index = 0; current; index++) {
      if (index >= config.maxSteps) throw new Error("Handoff step budget reached; human review required");
      const step = config.steps[current];
      if (!step) throw new Error(`Unknown step: ${current}`);
      if (step.role === "implement" && correctiveRounds >= 3) throw new Error("Three corrective code rounds reached; maintainer direction required");
      const head = gitHead(cwd), status = gitStatus(cwd);
      if (status) throw new Error("Handoff requires a clean committed worktree");
      const artifacts = fs.mkdtempSync(path.join(path.dirname(journal), `handoff-${index}-${step.role}-`));
      const completion = path.join(artifacts, "completion.json");
      const output = path.join(artifacts, "process.log");
      const prompt = fs.readFileSync(step.prompt, "utf8") + `\n\nHandoff contract: role=${step.role}, configured model=${step.model}, reviewed head=${head}. Write ${completion} with the editor tool as JSON: {"head":"<actual HEAD>","next":"<declared transition or null>","commentIds":[<numeric GitHub comment IDs>],"summary":"<result>"}. Allowed next steps: ${JSON.stringify(step.next)}. Review and adjudication must post their complete report/dispositions before completion; include those IDs. Do not mark ready or merge. Do not modify repository files during review.\n`;
      append({ event: "launching", index, step: current, role: step.role, model: step.model, head, output, completion });
      const log = fs.openSync(output, "wx");
      const child = spawn(step.executable, step.args, { cwd, shell: false, windowsHide: true, stdio: ["pipe", log, log] });
      append({ event: "running", index, step: current, pid: child.pid, startedAt: new Date().toISOString(), head, output, completion });
      const exited = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal })); });
      child.stdin.on("error", () => {});
      child.stdin.end(prompt);
      let result;
      try { result = await exited; } finally { fs.closeSync(log); }
      append({ event: "exited", index, step: current, ...result });
      if (result.code !== 0) throw new Error(`Role ${current} failed; inspect ${output}`);
      if (step.role === "review" && (gitHead(cwd) !== head || gitStatus(cwd) !== status)) throw new Error("Review changed the frozen head or worktree");
      const done = read(completion);
      if (done.head !== gitHead(cwd) || typeof done.summary !== "string" || !done.summary.trim() || !Array.isArray(done.commentIds) || !done.commentIds.every(Number.isSafeInteger)) throw new Error("Invalid or stale completion artifact");
      if (!(step.next.includes(done.next))) throw new Error("Undeclared transition");
      if (step.role !== "implement" && !done.commentIds.length) throw new Error("Review/adjudication needs posted comment IDs");
      for (const id of done.commentIds) {
        const comment = JSON.parse(execFileSync("gh", ["api", `repos/ImpowerGames/impower/issues/comments/${id}`], { cwd, encoding: "utf8", windowsHide: true }));
        if (comment.issue_url !== `https://api.github.com/repos/ImpowerGames/impower/issues/${config.pr}` || !comment.body.includes(done.head)) throw new Error("Comment does not verify this PR and head");
      }
      if (gitStatus(cwd)) throw new Error("Role left uncommitted work");
      if (step.role === "implement" && index > 0 && done.head !== head) correctiveRounds++;
      append({ event: "completed", index, step: current, ...done });
      current = done.next;
    }
    append({ event: "finished" });
  } catch (error) {
    append({ event: "blocked", reason: error.message });
    throw error;
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runHandoff(process.argv[2]).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
